import { describe, expect, it } from "vitest";
import { DELETED_AT } from "../model/row.fake";
import {
  availableBalance,
  emergencyOf,
  isDuplicateEmergency,
  listReserves,
  monthBalance,
  reserveBalance,
  savedInMonth,
} from "./balances";
import { movement, reserve, stateOf, tx } from "./fixtures.fake";

const BASE = stateOf({
  transactions: [
    tx("SAL", "income", 600_000, "2026-09-05"),
    tx("ALUG", "expense", 200_000, "2026-09-10"),
    tx("AGO", "income", 100_000, "2026-08-05"),
  ],
  reserves: [reserve("R1"), reserve("R2", { deletedAt: DELETED_AT })],
  movements: [
    movement("M1", "R1", 50_000, "2026-09-06"),
    movement("M2", "R1", -10_000, "2026-09-20"),
    movement("M3", "R1", 30_000, "2026-08-06"),
    movement("M4", "R2", 20_000, "2026-09-01"),
    movement("M5", "R1", 99_999, "2026-09-02", { deletedAt: DELETED_AT }),
  ],
});

describe("reserveBalance", () => {
  it("soma os movimentos vivos da reserva", () => {
    expect(reserveBalance(BASE, "R1")).toBe(70_000);
  });
});

describe("savedInMonth", () => {
  it("é o líquido do mês, inclusive de reserva apagada", () => {
    expect(savedInMonth(BASE, "2026-09")).toBe(60_000);
    expect(savedInMonth(BASE, "2026-08")).toBe(30_000);
  });
});

describe("monthBalance", () => {
  it("receitas − despesas − guardado líquido do mês", () => {
    expect(monthBalance(BASE, "2026-09")).toBe(600_000 - 200_000 - 60_000);
  });
});

describe("availableBalance", () => {
  it("saldo de todos os lançamentos menos tudo que está separado", () => {
    expect(availableBalance(BASE)).toBe(500_000 - 90_000);
  });
});

describe("emergência", () => {
  const two = stateOf({
    reserves: [
      reserve("B", { kind: "emergency" }),
      reserve("A", { kind: "emergency" }),
      reserve("C"),
    ],
  });

  it("a de menor id é a emergência; a outra é duplicada", () => {
    const a = two.reserves.A;
    const b = two.reserves.B;
    expect(emergencyOf(two)?.id).toBe("A");
    expect(b && isDuplicateEmergency(two, b)).toBe(true);
    expect(a && isDuplicateEmergency(two, a)).toBe(false);
  });

  it("listReserves põe a emergência primeiro e as caixinhas por criação", () => {
    expect(listReserves(two).map((r) => r.id)).toEqual(["A", "B", "C"]);
  });

  it("listReserves ignora apagadas", () => {
    expect(listReserves(BASE).map((r) => r.id)).toEqual(["R1"]);
  });
});
