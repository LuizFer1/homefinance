import { describe, expect, it } from "vitest";
import { EMPTY_APP_STATE } from "../model/app-state";
import type { ReserveMovement } from "../model/reserve";
import { DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { occurrenceKey } from "../recurrence/schedule";
import { depositSeed } from "../reserves/deposits";
import { movement, reserve, stateOf, tx } from "../reserves/fixtures.fake";
import { planDuplicateRepair } from "./duplicate-repair";
import { stableEntityIdV1, stableEntityIdV2 } from "./stable-id";

const S = "01JC0000000000000000000001";
const K = occurrenceKey(S, "2027-02");
const V1 = stableEntityIdV1(K);
const V2 = stableEntityIdV2(K);

const occ = (id: string, extra: Partial<Transaction> = {}) =>
  tx(id, "expense", 10_000, "2027-02-05", null, {
    recurrenceId: S,
    occurrenceKey: K,
    ...extra,
  });

const R = "01JC0000000000000000000R01";
const SEED = depositSeed(R, "2027-02");
const D1 = stableEntityIdV1(SEED);
const D2 = stableEntityIdV2(SEED);

const dep = (id: string, extra: Partial<ReserveMovement> = {}) =>
  movement(id, R, 5_000, "2027-02-10", { recurring: true, ...extra });

describe("planDuplicateRepair — ocorrência", () => {
  it("par vivo {v1(K), v2(K)} do mesmo fato: sobrevive a v1, a v2 vira tombstone", () => {
    const state = stateOf({ transactions: [occ(V1), occ(V2)] });
    const plan = planDuplicateRepair(state);
    expect(plan.transactions).toEqual([
      { loser: state.transactions[V2], keeper: state.transactions[V1], survivor: null },
    ]);
    expect(plan.reserveMovements).toEqual([]);
  });

  it("v2 confirmada e v1 estimada: a confirmação vai para a v1 no mesmo lote", () => {
    const v1 = occ(V1, { estimated: true, amountMinor: 9_000 });
    const v2 = occ(V2, {
      estimated: false,
      amountMinor: 12_345,
      occurredOn: "2027-02-07",
      importKey: "IMPORTKEY0000000000000000A",
    });
    const plan = planDuplicateRepair(stateOf({ transactions: [v1, v2] }));
    expect(plan.transactions).toEqual([
      {
        loser: v2,
        keeper: v1,
        survivor: {
          ...v1,
          amountMinor: 12_345,
          occurredOn: "2027-02-07",
          estimated: false,
          importKey: "IMPORTKEY0000000000000000A",
        },
      },
    ]);
  });

  it("v2 estimada e v1 confirmada (ou as duas confirmadas): a v1 fica como está", () => {
    for (const [a, b] of [
      [false, true],
      [null, null],
      [true, true],
    ] as const) {
      const v1 = occ(V1, { estimated: a, amountMinor: 1 });
      const v2 = occ(V2, { estimated: b, amountMinor: 2 });
      const plan = planDuplicateRepair(stateOf({ transactions: [v1, v2] }));
      expect(plan.transactions).toEqual([{ loser: v2, keeper: v1, survivor: null }]);
    }
  });

  it("mesma chave em outros ids: intocada (não é o par do cenário C)", () => {
    const outro = occ("01JC00000000000000000OUTRO");
    expect(planDuplicateRepair(stateOf({ transactions: [occ(V1), outro] })).transactions).toEqual(
      [],
    );
    expect(planDuplicateRepair(stateOf({ transactions: [occ(V2), outro] })).transactions).toEqual(
      [],
    );
  });

  it("tombstones ficam fora: uma duplicata viva nunca mata outra apagada", () => {
    for (const rows of [
      [occ(V1, { deletedAt: DELETED_AT }), occ(V2)],
      [occ(V1), occ(V2, { deletedAt: DELETED_AT })],
    ]) {
      expect(planDuplicateRepair(stateOf({ transactions: rows })).transactions).toEqual([]);
    }
  });

  it("lugar v1 de outro fato (ou ambíguo, sem campos): a v2 não é duplicata", () => {
    const outra = occ(V1, { recurrenceId: "01JC0000000000000000000002", occurrenceKey: "X" });
    const ambigua = occ(V1, { recurrenceId: null, occurrenceKey: null });
    for (const slot of [outra, ambigua]) {
      expect(planDuplicateRepair(stateOf({ transactions: [slot, occ(V2)] })).transactions).toEqual(
        [],
      );
    }
  });

  it("sem duplicata: plano vazio", () => {
    expect(planDuplicateRepair(EMPTY_APP_STATE)).toEqual({
      transactions: [],
      reserveMovements: [],
    });
    expect(planDuplicateRepair(stateOf({ transactions: [occ(V1)] })).transactions).toEqual([]);
  });
});

describe("planDuplicateRepair — depósito mensal", () => {
  it("par vivo {v1, v2} do mesmo depósito: sobrevive a v1", () => {
    const v1 = dep(D1);
    const v2 = dep(D2, { period: "2027-02" });
    const plan = planDuplicateRepair(stateOf({ reserves: [reserve(R)], movements: [v1, v2] }));
    expect(plan.reserveMovements).toEqual([{ loser: v2, keeper: v1 }]);
  });

  it("v1 de outra reserva, ou movimento manual, ou tombstone: nada", () => {
    const v2 = dep(D2, { period: "2027-02" });
    for (const v1 of [
      dep(D1, { reserveId: "01JC0000000000000000000R02" }),
      dep(D1, { recurring: false }),
      dep(D1, { deletedAt: DELETED_AT }),
    ]) {
      expect(planDuplicateRepair(stateOf({ movements: [v1, v2] })).reserveMovements).toEqual([]);
    }
  });

  it("depósito antigo com a data movida para um mês que já tem depósito não é par de nada", () => {
    // O v1 de fevereiro com a data editada para março; o depósito de março num id
    // aleatório não é par {v1, v2} de semente nenhuma.
    const fev = dep(D1, { occurredOn: "2027-03-02" });
    const mar = dep("01JC0000000000000000000MAR", { occurredOn: "2027-03-10", period: "2027-03" });
    expect(planDuplicateRepair(stateOf({ movements: [fev, mar] })).reserveMovements).toEqual([]);
  });
});
