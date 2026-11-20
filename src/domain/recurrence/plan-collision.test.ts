import { describe, expect, it } from "vitest";
import { collidingId } from "../ids/collision.fake";
import { stableEntityIdV1, stableEntityIdV2 } from "../ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { periodChoices } from "./adjust-plan";
import { lostOccurrences, planOccurrences } from "./plan";
import { occurrenceKey } from "./schedule";
import { projectRecurrences } from "./upcoming";

/**
 * Colisão do id estável nas ocorrências (spec do id estável, §4.2, §4.3, §6). O
 * par verificado de §2: `…01:2027-02` e `…02:2027-01` caem no mesmo v1.
 */
const A = "01JC0000000000000000000001";
const B = "01JC0000000000000000000002";
const KA = occurrenceKey(A, "2027-02");
const KB = occurrenceKey(B, "2027-01");
const SLOT = stableEntityIdV1(KA);

function serie(id: string, startOn: string, extra: Partial<Recurrence> = {}): Recurrence {
  return {
    ...ALIVE,
    id,
    kind: "expense",
    description: id,
    amountMinor: 10_000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    frequency: "monthly",
    scheduleType: "dayOfMonth",
    scheduleN: 5,
    startOn,
    endOn: null,
    active: true,
    ...extra,
  };
}

function linha(id: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    ...ALIVE,
    id,
    kind: "expense",
    description: id,
    amountMinor: 1,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: "2027-01-05",
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
    ...extra,
  };
}

function estado(series: Recurrence[], transactions: Transaction[] = []): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: Object.fromEntries(series.map((row) => [row.id, row])),
    transactions: Object.fromEntries(transactions.map((row) => [row.id, row])),
  };
}

const ids = (plans: { entityId: string; draft: { occurrenceKey: string | null } }[]) =>
  plans.map((plan) => [plan.draft.occurrenceKey, plan.entityId]);

it("o par verificado colide mesmo na v1", () => {
  expect(stableEntityIdV1(KB)).toBe(SLOT);
  expect(stableEntityIdV2(KA)).not.toBe(stableEntityIdV2(KB));
});

describe("planOccurrences com o lugar v1 disputado", () => {
  it("(a) duas séries do mês corrente no mesmo lugar: as duas nascem, a segunda em v2", () => {
    // B ganha uma série que colide com A no mês corrente (2027-02).
    const C = collidingId("01JC0000000000000000000", A, (id) => occurrenceKey(id, "2027-02"));
    const state = estado([serie(A, "2027-02-05"), serie(C, "2027-02-05")]);
    const plans = planOccurrences(state, "2027-02-10");
    const [first, second] = [A, C].sort();
    expect(ids(plans)).toEqual([
      [occurrenceKey(first ?? "", "2027-02"), SLOT],
      [
        occurrenceKey(second ?? "", "2027-02"),
        stableEntityIdV2(occurrenceKey(second ?? "", "2027-02")),
      ],
    ]);
  });

  it("(b) lugar livre: v1, igual ao app de hoje, inclusive série nova com passado", () => {
    const plans = planOccurrences(estado([serie(A, "2026-11-05")]), "2027-02-10");
    expect(plans.map((plan) => plan.entityId)).toEqual(
      ["2026-11", "2026-12", "2027-01", "2027-02"].map((p) =>
        stableEntityIdV1(occurrenceKey(A, p)),
      ),
    );
  });

  it("(c) a chave já tem linha em outro id: não materializa de novo", () => {
    const outra = linha("01JC000000000000000000LINE", { recurrenceId: A, occurrenceKey: KA });
    expect(planOccurrences(estado([serie(A, "2027-02-05")], [outra]), "2027-02-10")).toEqual([]);
  });

  it("(d) tombstone com a chave, em v1 ou v2: não volta", () => {
    for (const id of [SLOT, stableEntityIdV2(KA), "01JC000000000000000000LINE"]) {
      const apagada = linha(id, { recurrenceId: A, occurrenceKey: KA, deletedAt: DELETED_AT });
      expect(planOccurrences(estado([serie(A, "2027-02-05")], [apagada]), "2027-02-10")).toEqual(
        [],
      );
    }
  });

  it("(e) tombstone de outra chave no lugar: v2, e o tombstone não é tocado", () => {
    const deB = linha(SLOT, { recurrenceId: B, occurrenceKey: KB, deletedAt: DELETED_AT });
    const plans = planOccurrences(estado([serie(A, "2027-02-05")], [deB]), "2027-02-10");
    expect(ids(plans)).toEqual([[KA, stableEntityIdV2(KA)]]);
  });

  it("(f) linha sem chave nem série no lugar (ambígua): nada, nem v1 nem v2", () => {
    const antiga = linha(SLOT);
    const state = estado([serie(A, "2027-02-05")], [antiga]);
    expect(planOccurrences(state, "2027-02-10")).toEqual([]);
    expect(lostOccurrences(state, "2027-03-10")).toEqual([]);
    // A futura também conta como existente na projeção.
    expect(projectRecurrences(state, "2027-01-31", "2027-02-28")).toEqual([]);
  });

  it("linha meio preenchida que não contradiz a chave conta como o fato; a que contradiz, não", () => {
    const fato = [
      linha(SLOT, { recurrenceId: A }),
      linha(SLOT, { occurrenceKey: KA }),
      linha(SLOT, { recurrenceId: A, occurrenceKey: KA }),
    ];
    for (const row of fato) {
      expect(planOccurrences(estado([serie(A, "2027-02-05")], [row]), "2027-02-10")).toEqual([]);
    }
    const outro = [linha(SLOT, { recurrenceId: B }), linha(SLOT, { occurrenceKey: KB })];
    for (const row of outro) {
      const plans = planOccurrences(estado([serie(A, "2027-02-05")], [row]), "2027-02-10");
      expect(ids(plans)).toEqual([[KA, stableEntityIdV2(KA)]]);
    }
  });

  it("(g) guarda do passado: lugar de outro fato + mês passado → nada; mês corrente → v2", () => {
    const deB = linha(SLOT, { recurrenceId: B, occurrenceKey: KB });
    const state = estado([serie(A, "2027-02-05")], [deB]);
    expect(planOccurrences(state, "2027-03-10").map((plan) => plan.draft.occurrenceKey)).toEqual([
      occurrenceKey(A, "2027-03"),
    ]);
    expect(ids(planOccurrences(state, "2027-02-10"))).toEqual([[KA, stableEntityIdV2(KA)]]);
  });

  it("guarda no mesmo lote: chave passada empurrada para v2 por outra do lote é pulada", () => {
    // B (2027-01) e A (2027-02) livres e no mesmo lugar: A vem antes pelo id e
    // reserva o v1; B, de mês passado, fica para a folha de recuperação.
    const state = estado([serie(A, "2027-02-05"), serie(B, "2027-01-05")]);
    const plans = planOccurrences(state, "2027-02-10");
    expect(ids(plans)).toEqual([
      [KA, SLOT],
      [occurrenceKey(B, "2027-02"), stableEntityIdV1(occurrenceKey(B, "2027-02"))],
    ]);
  });

  it("duas competências da mesma série no mesmo lugar: a primeira em v1, a segunda pela guarda", () => {
    const S = "01JC0000000000000000000009";
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (let y = 2000; y < 2100 && pair === null; y += 1) {
      for (let m = 1; m <= 12; m += 1) {
        const period = `${y}-${String(m).padStart(2, "0")}`;
        const id = stableEntityIdV1(occurrenceKey(S, period));
        const first = seen.get(id);
        if (first !== undefined) {
          pair = [first, period];
          break;
        }
        seen.set(id, period);
      }
    }
    if (pair === null) throw new Error("nenhuma colisão");
    const [p1, p2] = pair;
    const series = serie(S, `${p1}-05`, { endOn: `${p2}-05` });

    // Hoje no mês de p2: a segunda nasce em v2 no mesmo lote, sem id repetido.
    const plans = planOccurrences(estado([series]), `${p2}-10`);
    const byKey = new Map(ids(plans) as [string, string][]);
    expect(byKey.get(occurrenceKey(S, p1))).toBe(stableEntityIdV1(occurrenceKey(S, p1)));
    expect(byKey.get(occurrenceKey(S, p2))).toBe(stableEntityIdV2(occurrenceKey(S, p2)));
    expect(new Set(plans.map((plan) => plan.entityId)).size).toBe(plans.length);

    // Hoje depois de p2: a segunda é passada e fica de fora (candidata da folha).
    const later = planOccurrences(estado([series]), `${Number(p2.slice(0, 4)) + 1}-12-31`);
    expect(later.some((plan) => plan.draft.occurrenceKey === occurrenceKey(S, p2))).toBe(false);
  });

  it("lugar v1 com linha da outra conta, mesmo sem chave: é outro fato", () => {
    const daOutra = linha(SLOT, { book: "business" });
    const plans = planOccurrences(estado([serie(A, "2027-02-05")], [daOutra]), "2027-02-10");
    expect(ids(plans)).toEqual([[KA, stableEntityIdV2(KA)]]);
  });
});

describe("leitores pela chave", () => {
  it("(h) projectRecurrences mostra a futura cujo lugar é de outro fato", () => {
    const deB = linha(SLOT, { recurrenceId: B, occurrenceKey: KB });
    const state = estado([serie(A, "2027-01-05")], [deB]);
    const found = projectRecurrences(state, "2027-01-31", "2027-02-28");
    expect(found.map((item) => item.date)).toEqual(["2027-02-05"]);
  });

  it("projectRecurrences esconde a que já tem linha em v2", () => {
    const emV2 = linha(stableEntityIdV2(KA), { recurrenceId: A, occurrenceKey: KA });
    const state = estado([serie(A, "2027-01-05")], [emV2]);
    expect(projectRecurrences(state, "2027-01-31", "2027-02-28")).toEqual([]);
  });

  it("(h) periodChoices não pula a competência cujo lugar é de outro fato", () => {
    const jan = linha(stableEntityIdV1(occurrenceKey(A, "2027-01")), {
      recurrenceId: A,
      occurrenceKey: occurrenceKey(A, "2027-01"),
    });
    const deB = linha(SLOT, { recurrenceId: B, occurrenceKey: KB });
    const series = serie(A, "2027-01-05");
    expect(periodChoices(estado([series], [jan, deB]), series).initial).toBe("2027-02");
  });
});

describe("lostOccurrences", () => {
  it("candidata: mês passado, sem linha pela chave, lugar de outro fato; id v2", () => {
    const deB = linha(SLOT, { recurrenceId: B, occurrenceKey: KB });
    const state = estado([serie(A, "2027-02-05", { endOn: "2027-02-05" })], [deB]);
    const lost = lostOccurrences(state, "2027-04-10");
    expect(lost.map((item) => [item.draft.occurrenceKey, item.entityId, item.period])).toEqual([
      [KA, stableEntityIdV2(KA), "2027-02"],
    ]);
  });

  it("mês corrente nunca é candidata (o planejador já grava em v2)", () => {
    const deB = linha(SLOT, { recurrenceId: B, occurrenceKey: KB });
    expect(lostOccurrences(estado([serie(A, "2027-02-05")], [deB]), "2027-02-10")).toEqual([]);
  });

  it("com a linha (ou o tombstone) v2 gravada, deixa de ser candidata", () => {
    const deB = linha(SLOT, { recurrenceId: B, occurrenceKey: KB });
    const naoRecriar = linha(stableEntityIdV2(KA), {
      recurrenceId: A,
      occurrenceKey: KA,
      deletedAt: DELETED_AT,
    });
    const state = estado([serie(A, "2027-02-05", { endOn: "2027-02-05" })], [deB, naoRecriar]);
    expect(lostOccurrences(state, "2027-04-10")).toEqual([]);
  });
});
