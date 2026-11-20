import { describe, expect, it } from "vitest";
import { stableEntityIdV1, stableEntityIdV2 } from "../ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { mergedOrphans, recoveryCandidates } from "./recovery";
import { occurrenceKey } from "./schedule";

/** Achado 4 da revisão do id estável: reparo + exclusão da v1 ao mesmo tempo. */
const S = "01JC0000000000000000000001";
const K = occurrenceKey(S, "2027-02");
const V1 = stableEntityIdV1(K);
const V2 = stableEntityIdV2(K);

const serie: Recurrence = {
  ...ALIVE,
  id: S,
  kind: "expense",
  description: "Luz",
  amountMinor: 10_000,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  frequency: "monthly",
  scheduleType: "dayOfMonth",
  scheduleN: 5,
  startOn: "2027-02-05",
  endOn: "2027-02-05",
  active: true,
};

function ocorrencia(id: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    ...ALIVE,
    id,
    kind: "expense",
    description: "Luz",
    amountMinor: 10_000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: "2027-02-05",
    userId: "AUTOR",
    recurrenceId: S,
    occurrenceKey: K,
    ...extra,
  };
}

function estado(rows: Transaction[], series: Recurrence = serie): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: { [series.id]: series },
    transactions: Object.fromEntries(rows.map((row) => [row.id, row])),
  };
}

const doReparo = ocorrencia(V2, { deletedAt: DELETED_AT, mergedInto: V1 });
const v1Apagada = ocorrencia(V1, { deletedAt: DELETED_AT });

describe("mergedOrphans", () => {
  it("v2 apagada pelo reparo e v1 apagada depois: pergunta, com a v2 para regravar", () => {
    const [item, ...rest] = mergedOrphans(estado([doReparo, v1Apagada]), "personal");

    expect(rest).toEqual([]);
    expect(item).toMatchObject({
      entityId: V2,
      period: "2027-02",
      userId: "AUTOR",
      draft: { occurrenceKey: K, recurrenceId: S, amountMinor: 10_000 },
      merged: { tombstone: doReparo, keeper: v1Apagada },
    });
    // Qualquer mês: o reparo roda também no corrente.
    expect(recoveryCandidates(estado([doReparo, v1Apagada]), "personal", "2027-02-10")).toEqual([
      item,
    ]);
  });

  it("v1 viva: o reparo funcionou, nada a perguntar", () => {
    expect(mergedOrphans(estado([doReparo, ocorrencia(V1)]), "personal")).toEqual([]);
  });

  it("v2 apagada pela pessoa (sem `mergedInto`) e v1 apagada: exclusão comum, não pergunta", () => {
    const comum = ocorrencia(V2, { deletedAt: DELETED_AT });
    expect(mergedOrphans(estado([comum, v1Apagada]), "personal")).toEqual([]);
  });

  it("a chave tem outra linha viva: não pergunta", () => {
    const outra = ocorrencia("01JC00000000000000000OUTRA");
    expect(mergedOrphans(estado([doReparo, v1Apagada, outra]), "personal")).toEqual([]);
  });

  it("série apagada, ou a outra conta: não pergunta", () => {
    expect(
      mergedOrphans(estado([doReparo, v1Apagada], { ...serie, deletedAt: DELETED_AT }), "personal"),
    ).toEqual([]);
    expect(mergedOrphans(estado([doReparo, v1Apagada]), "business")).toEqual([]);
  });
});
