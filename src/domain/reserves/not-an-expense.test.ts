import { describe, expect, it } from "vitest";
import { monthlyTotals } from "../projections/breakdown";
import { cashbackSummary, categoryBreakdown, spendingPace } from "../projections/insights";
import { lastMonths } from "../projections/periods";
import { listTransactions, totals } from "../projections/selectors";
import { movement, reserve, stateOf, tx } from "./fixtures.fake";

describe("regra 1: movimento de reserva não é despesa nem receita", () => {
  const transactions = [
    tx("SAL", "income", 500_000, "2026-09-05"),
    tx("MER", "expense", 80_000, "2026-09-08", "ALI", { cashbackMinor: 800 }),
  ];
  const without = stateOf({ transactions });
  const withReserves = stateOf({
    transactions,
    reserves: [reserve("R1")],
    movements: [
      movement("M1", "R1", 50_000, "2026-09-06"),
      movement("M2", "R1", -10_000, "2026-09-20"),
    ],
  });

  it("gráficos, ritmo, categorias e cashback ficam idênticos", () => {
    for (const fn of [
      (s: typeof without) => totals(listTransactions(s)),
      (s: typeof without) => monthlyTotals(listTransactions(s), lastMonths("2026-09-30", 6)),
      (s: typeof without) => spendingPace(listTransactions(s), "2026-09", "2026-09-30"),
      (s: typeof without) => categoryBreakdown(listTransactions(s), s),
      (s: typeof without) => cashbackSummary(listTransactions(s), s),
    ]) {
      expect(fn(withReserves)).toEqual(fn(without));
    }
  });
});
