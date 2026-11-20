import { describe, expect, it } from "vitest";
import { stableEntityIdV1, stableEntityIdV2 } from "../ids/stable-id";
import type { Recurrence } from "../model/recurrence";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { parseStatement } from "./parse";
import {
  classifyImport,
  type ImportSlots,
  importSeeds,
  planImport,
  type ReviewedEntry,
} from "./plan";

/**
 * Importação com a colisão do id estável (spec do id estável, §4.4): o lugar v1
 * da linha pode ser de outro fato, e a linha importada não guardava a semente.
 */
const CARD = "CARTAO-1";
const ctx = { paymentMethodId: CARD, referenceMonth: "2026-10" };

function reviewed(lines: string[]): ReviewedEntry[] {
  return parseStatement(lines, "card", "2026-10").entries.map((e) => ({ ...e, categoryId: null }));
}

const [IFOOD] = reviewed(["12/09 IFOOD 45,90"]);
if (IFOOD === undefined) throw new Error("sem linha");
const [SEED = ""] = importSeeds([IFOOD], ctx);
const V1 = stableEntityIdV1(SEED);
const V2 = stableEntityIdV2(SEED);

function linha(id: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    ...ALIVE,
    id,
    kind: "expense",
    description: "IFOOD",
    amountMinor: 4590,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: CARD,
    cashbackMinor: null,
    occurredOn: "2026-09-12",
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
    ...extra,
  };
}

const slots = (transactions: Transaction[] = [], recurrences: Recurrence[] = []): ImportSlots => ({
  transactions: Object.fromEntries(transactions.map((row) => [row.id, row])),
  recurrences: Object.fromEntries(recurrences.map((row) => [row.id, row])),
});

describe("classifyImport — avulsa", () => {
  it("lugar livre: nova, em v1, com importKey v2", () => {
    expect(classifyImport([IFOOD], ctx, slots())).toEqual([
      { status: "new", id: V1, importKey: V2 },
    ]);
  });

  it("lugar v1 é uma ocorrência: talvez já importada; marcada, grava em v2 com importKey v2", () => {
    const ocorrencia = linha(V1, { recurrenceId: "SERIE", occurrenceKey: "SERIE:2026-09" });
    const state = slots([ocorrencia]);
    expect(classifyImport([IFOOD], ctx, state)).toEqual([
      { status: "maybe", id: V2, importKey: V2 },
    ]);
    const plan = planImport([{ ...IFOOD, selected: true }], ctx, state);
    expect(plan.transactions.map(({ id, draft }) => [id, draft.importKey])).toEqual([[V2, V2]]);
  });

  it("lugar v1 com mesmos tipo, valor, data e forma: já importada (o app de antes)", () => {
    const antiga = linha(V1, { description: "Jantar editado", categoryId: "ALIM" });
    expect(classifyImport([IFOOD], ctx, slots([antiga]))[0]?.status).toBe("imported");
  });

  it("lugar v1 com outra forma de pagamento ou outro valor: talvez", () => {
    for (const extra of [
      { paymentMethodId: "OUTRO" },
      { amountMinor: 1 },
      { kind: "income" as const },
    ]) {
      expect(classifyImport([IFOOD], ctx, slots([linha(V1, extra)]))[0]?.status).toBe("maybe");
    }
  });

  it("reimportar depois de gravar em v2: já importada pela importKey", () => {
    const ocorrencia = linha(V1, { recurrenceId: "SERIE", occurrenceKey: "SERIE:2026-09" });
    const gravada = linha(V2, { importKey: V2 });
    expect(classifyImport([IFOOD], ctx, slots([ocorrencia, gravada]))[0]?.status).toBe("imported");
  });

  it("a linha que confirmou uma estimativa (importKey v1 de antes, ou v2): já importada", () => {
    for (const key of [V1, V2]) {
      const confirmada = linha("OCORRENCIA", {
        importKey: key,
        recurrenceId: "S",
        occurrenceKey: "S:1",
      });
      expect(classifyImport([IFOOD], ctx, slots([confirmada]))[0]?.status).toBe("imported");
    }
  });

  it("linha importada e apagada não volta (no v1 pelos campos, no v2 pela importKey)", () => {
    const noV1 = linha(V1, { deletedAt: DELETED_AT });
    const noV2 = linha(V2, { importKey: V2, deletedAt: DELETED_AT });
    expect(classifyImport([IFOOD], ctx, slots([noV1]))[0]?.status).toBe("imported");
    expect(classifyImport([IFOOD], ctx, slots([noV2]))[0]?.status).toBe("imported");
  });

  it("linha já importada não entra no plano nem marcada", () => {
    const antiga = linha(V1);
    expect(planImport([{ ...IFOOD, selected: true }], ctx, slots([antiga]))).toEqual({
      transactions: [],
      series: [],
      confirmations: [],
    });
  });

  it("duas linhas do mesmo PDF no mesmo lugar livre: a segunda vai para v2", () => {
    // Procura uma segunda compra cuja semente cai no mesmo v1 da primeira.
    let other: ReviewedEntry | undefined;
    for (let cents = 1; cents < 5000 && other === undefined; cents += 1) {
      const value = `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
      const [candidate] = reviewed([`12/09 IFOOD ${value}`]);
      if (candidate === undefined || candidate.amountMinor === IFOOD.amountMinor) continue;
      const [seed = ""] = importSeeds([candidate], ctx);
      if (stableEntityIdV1(seed) === V1) other = candidate;
    }
    if (other === undefined) throw new Error("nenhuma colisão");
    const [, seed2 = ""] = importSeeds([IFOOD, other], ctx);
    expect(classifyImport([IFOOD, other], ctx, slots())).toEqual([
      { status: "new", id: V1, importKey: V2 },
      { status: "new", id: stableEntityIdV2(seed2), importKey: stableEntityIdV2(seed2) },
    ]);
    const plan = planImport([IFOOD, other], ctx, slots());
    expect(new Set(plan.transactions.map((t) => t.id)).size).toBe(2);
  });
});

describe("classifyImport — parcela", () => {
  const [OUT] = reviewed(["15/07 LOJA 03/10 150,00"]);
  const [NOV] = parseStatement(["15/07 LOJA 04/10 150,00"], "card", "2026-11").entries.map((e) => ({
    ...e,
    categoryId: null,
  }));
  if (OUT === undefined || NOV === undefined) throw new Error("sem linha");
  const [PSEED = ""] = importSeeds([OUT], ctx);
  const P1 = stableEntityIdV1(PSEED);
  const P2 = stableEntityIdV2(PSEED);

  function serie(id: string, extra: Partial<Recurrence> = {}): Recurrence {
    return {
      ...ALIVE,
      id,
      kind: "expense",
      description: "LOJA (10x)",
      amountMinor: 15_000,
      currency: "BRL",
      categoryId: null,
      paymentMethodId: CARD,
      cashbackMinor: null,
      frequency: "monthly",
      scheduleType: "dayOfMonth",
      scheduleN: 15,
      startOn: "2026-07-15",
      endOn: "2027-04-15",
      active: true,
      ...extra,
    };
  }

  it("a fatura seguinte tem a mesma semente", () => {
    expect(importSeeds([NOV], { ...ctx, referenceMonth: "2026-11" })).toEqual([PSEED]);
  });

  it("lugar v1 com a série desta compra (app de antes): já importada", () => {
    expect(classifyImport([OUT], ctx, slots([], [serie(P1)]))[0]?.status).toBe("imported");
  });

  it("lugar v1 com a série de outra compra: a desta nasce em v2, e a fatura seguinte a acha", () => {
    const outra = serie(P1, { amountMinor: 9_999, description: "OUTRA (3x)" });
    const plan = planImport([OUT], ctx, slots([], [outra]));
    expect(plan.series.map(({ id, draft }) => [id, draft.importKey])).toEqual([[P2, P2]]);

    const gravada = serie(P2, { importKey: P2 });
    expect(
      classifyImport([NOV], { ...ctx, referenceMonth: "2026-11" }, slots([], [outra, gravada]))[0]
        ?.status,
    ).toBe("imported");
  });

  it("o lugar é procurado na tabela de séries, não na de transações", () => {
    expect(classifyImport([OUT], ctx, slots([linha(P1)]))[0]).toEqual({
      status: "new",
      id: P1,
      importKey: P2,
    });
  });
});
