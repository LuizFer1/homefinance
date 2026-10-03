import { describe, expect, it } from "vitest";
import { stableEntityId } from "../ids/stable-id";
import { DELETED_AT } from "../model/row.fake";
import { depositId, planDeposits } from "./deposits";
import { movement, reserve, stateOf, tx } from "./fixtures.fake";

const SALARIO = tx("SAL", "income", 300_000, "2026-10-05");
const R = reserve("R1", { recurring: { amountMinor: 50_000, day: 6, since: "2026-09" } });

describe("depositId", () => {
  it("é estável por reserva e mês", () => {
    expect(depositId("R1", "2026-10")).toBe(stableEntityId("reserve:R1:2026-10"));
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

  it("reserva apagada ou sem recorrência: nada", () => {
    const dead = { ...R, deletedAt: DELETED_AT };
    const none = reserve("R2");
    expect(
      planDeposits(stateOf({ transactions: [SALARIO], reserves: [dead, none] }), "2026-10-20"),
    ).toEqual([]);
  });
});
