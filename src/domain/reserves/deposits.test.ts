import { describe, expect, it } from "vitest";
import { stableEntityIdV1 } from "../ids/stable-id";
import type { ReserveMovement } from "../model/reserve";
import { DELETED_AT } from "../model/row.fake";
import { depositId, isDepositFor, planDeposits } from "./deposits";
import { movement, reserve, stateOf, tx } from "./fixtures.fake";

const SALARIO = tx("SAL", "income", 300_000, "2026-10-05");
const R = reserve("R1", { recurring: { amountMinor: 50_000, day: 6, since: "2026-09" } });

describe("depositId", () => {
  it("é estável por reserva e mês", () => {
    expect(depositId("R1", "2026-10")).toBe(stableEntityIdV1("reserve:R1:2026-10"));
  });
});

describe("planDeposits", () => {
  it("dia chegou e há saldo: planeja o depósito do mês atual", () => {
    const plans = planDeposits(stateOf({ transactions: [SALARIO], reserves: [R] }), "2026-10-06");
    expect(plans).toEqual([
      {
        id: depositId("R1", "2026-10"),
        reserveId: "R1",
        amountMinor: 50_000,
        occurredOn: "2026-10-06",
      },
    ]);
  });

  it("since igual ao mês atual e hoje no dia exato: planeja", () => {
    const r = reserve("R1", { recurring: { amountMinor: 50_000, day: 6, since: "2026-10" } });
    const plans = planDeposits(stateOf({ transactions: [SALARIO], reserves: [r] }), "2026-10-06");
    expect(plans).toHaveLength(1);
  });

  it("movimento manual antes já baixou o saldo do mês: pula", () => {
    const manual = movement("M1", "R1", 260_000, "2026-10-02");
    const state = stateOf({ transactions: [SALARIO], reserves: [R], movements: [manual] });
    expect(planDeposits(state, "2026-10-20")).toEqual([]);
  });

  it("valor zero ou negativo na regra nunca planeja", () => {
    const zero = reserve("R1", { recurring: { amountMinor: 0, day: 1, since: "2026-01" } });
    const neg = reserve("R2", { recurring: { amountMinor: -5, day: 1, since: "2026-01" } });
    const state = stateOf({ transactions: [SALARIO], reserves: [zero, neg] });
    expect(planDeposits(state, "2026-10-20")).toEqual([]);
  });

  it("antes do dia, nada", () => {
    expect(planDeposits(stateOf({ transactions: [SALARIO], reserves: [R] }), "2026-10-05")).toEqual(
      [],
    );
  });

  it("antes de `since`, nada", () => {
    const later = reserve("R1", { recurring: { amountMinor: 50_000, day: 6, since: "2026-11" } });
    expect(
      planDeposits(stateOf({ transactions: [SALARIO], reserves: [later] }), "2026-10-20"),
    ).toEqual([]);
  });

  it("dia 31 em mês curto vale o último dia", () => {
    const r31 = reserve("R1", { recurring: { amountMinor: 1, day: 31, since: "2026-01" } });
    const state = stateOf({
      transactions: [tx("S", "income", 10, "2027-02-01")],
      reserves: [r31],
    });
    expect(planDeposits(state, "2027-02-27")).toEqual([]);
    expect(planDeposits(state, "2027-02-28")).toHaveLength(1);
  });

  it("saldo do mês insuficiente: pula sem planejar", () => {
    const state = stateOf({
      transactions: [tx("S", "income", 40_000, "2026-10-01")],
      reserves: [R],
    });
    expect(planDeposits(state, "2026-10-20")).toEqual([]);
  });

  it("duas reservas disputam o mesmo saldo: a segunda pula se não couber", () => {
    const R2 = reserve("R2", { recurring: { amountMinor: 50_000, day: 1, since: "2026-01" } });
    const state = stateOf({
      transactions: [tx("S", "income", 80_000, "2026-10-01")],
      reserves: [R, R2],
    });
    expect(planDeposits(state, "2026-10-20").map((p) => p.reserveId)).toEqual(["R1"]);
  });

  it("linha do mês já existe (mesmo apagada): não planeja", () => {
    const gone = movement(depositId("R1", "2026-10"), "R1", 50_000, "2026-10-06", {
      deletedAt: DELETED_AT,
    });
    const state = stateOf({ transactions: [SALARIO], reserves: [R], movements: [gone] });
    expect(planDeposits(state, "2026-10-20")).toEqual([]);
  });

  it("dois estados com o mesmo depósito convergem para uma linha", () => {
    // Dois celulares offline materializam o mesmo mês, cada um no seu state.
    const phoneA = stateOf({ transactions: [SALARIO], reserves: [R] });
    const phoneB = stateOf({ transactions: [SALARIO], reserves: [R] });
    const [planA] = planDeposits(phoneA, "2026-10-06");
    const [planB] = planDeposits(phoneB, "2026-10-20");
    expect(planA?.id).toBe(depositId("R1", "2026-10"));
    expect(planB?.id).toBe(planA?.id);

    // O sync junta as linhas por id: as duas viram uma só.
    const rowA = movement(planA?.id ?? "", "R1", 50_000, "2026-10-06", { recurring: true });
    const rowB = movement(planB?.id ?? "", "R1", 50_000, "2026-10-20", { recurring: true });
    const merged = stateOf({ transactions: [SALARIO], reserves: [R], movements: [rowA, rowB] });
    expect(Object.keys(merged.reserveMovements)).toHaveLength(1);

    // E quem recebe a linha do outro não planeja de novo.
    const afterSync = stateOf({ transactions: [SALARIO], reserves: [R], movements: [rowA] });
    expect(planDeposits(afterSync, "2026-10-20")).toEqual([]);
  });

  it("reserva apagada ou sem recorrência: nada", () => {
    const dead = { ...R, deletedAt: DELETED_AT };
    const none = reserve("R2");
    expect(
      planDeposits(stateOf({ transactions: [SALARIO], reserves: [dead, none] }), "2026-10-20"),
    ).toEqual([]);
  });
});

describe("isDepositFor", () => {
  const RES = "01JC0000000000000000000R01";
  const dep = (id: string, occurredOn: string, extra: Partial<ReserveMovement> = {}) =>
    movement(id, RES, 5_000, occurredOn, { recurring: true, ...extra });

  /** Dois meses da mesma reserva cujo depósito cai no mesmo lugar v1. */
  function collidingMonths(): [string, string] {
    const seen = new Map<string, string>();
    for (let year = 2020; year < 2120; year += 1) {
      for (let m = 1; m <= 12; m += 1) {
        const month = `${year}-${String(m).padStart(2, "0")}`;
        const id = depositId(RES, month);
        const first = seen.get(id);
        if (first !== undefined) return [first, month];
        seen.set(id, month);
      }
    }
    throw new Error("nenhuma colisão");
  }

  it("linha nova: vale o `period`, não a data nem o id", () => {
    const row = dep("QUALQUER", "2027-03-02", { period: "2027-02" });
    expect(isDepositFor(row, RES, "2027-02")).toBe(true);
    expect(isDepositFor(row, RES, "2027-03")).toBe(false);
  });

  it("linha antiga com a data no próprio mês: é o depósito desse mês", () => {
    const row = dep(depositId(RES, "2027-02"), "2027-02-10");
    expect(isDepositFor(row, RES, "2027-02")).toBe(true);
    expect(isDepositFor(row, RES, "2027-03")).toBe(false);
  });

  it("linha antiga com a data movida: vale pelo lugar e não bloqueia o mês para onde foi", () => {
    const row = dep(depositId(RES, "2027-02"), "2027-03-01");
    expect(isDepositFor(row, RES, "2027-02")).toBe(true);
    expect(isDepositFor(row, RES, "2027-03")).toBe(false);
  });

  it("dois meses da mesma reserva no mesmo lugar v1: um não bloqueia o outro", () => {
    const [first, second] = collidingMonths();
    const row = dep(depositId(RES, first), `${first}-10`);
    expect(isDepositFor(row, RES, first)).toBe(true);
    expect(isDepositFor(row, RES, second)).toBe(false);
  });

  it("outra reserva ou movimento manual: nunca", () => {
    const outra = movement(depositId(RES, "2027-02"), "R2", 5_000, "2027-02-10", {
      recurring: true,
    });
    const manual = dep(depositId(RES, "2027-02"), "2027-02-10", { recurring: false });
    expect(isDepositFor(outra, RES, "2027-02")).toBe(false);
    expect(isDepositFor(manual, RES, "2027-02")).toBe(false);
  });
});
