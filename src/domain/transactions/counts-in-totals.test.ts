import { describe, expect, it } from "vitest";
import { monthlyTotals } from "../projections/breakdown";
import { estimatedTotals } from "../projections/estimates";
import {
  cashbackSummary,
  categoryBreakdown,
  monthComparison,
  spendingPace,
} from "../projections/insights";
import { lastMonths } from "../projections/periods";
import { listTransactions, totals } from "../projections/selectors";
import { availableBalance } from "../reserves/balances";
import { essentialCost } from "../reserves/essential";
import { stateOf, tx } from "../reserves/fixtures.fake";
import { countsInTotals } from "./counts-in-totals";

const base = [
  tx("SAL", "income", 500_000, "2026-09-05"),
  tx("MER", "expense", 80_000, "2026-09-08", "ALI", { cashbackMinor: 800 }),
  tx("AGO", "expense", 20_000, "2026-08-12", "ALI"),
];

// O mesmo mês com lançamentos que não contam: se alguma projeção os somar, ela
// diverge do estado sem eles.
const extras = [
  tx("FAT", "expense", 300_000, "2026-09-10", "ALI", {
    reportState: "transfer",
    cashbackMinor: 3_000,
  }),
  tx("EST", "income", 300_000, "2026-09-10", null, { reportState: "transfer" }),
  tx("OCU", "expense", 45_000, "2026-09-15", "ALI", { reportState: "hidden", estimated: true }),
  tx("AGX", "expense", 70_000, "2026-08-20", "ALI", { reportState: "hidden" }),
];

describe("lançamento marcado como transferência ou oculto não conta", () => {
  const without = stateOf({ transactions: base });
  const marked = stateOf({ transactions: [...base, ...extras] });

  it("todas as projeções dão o mesmo resultado com e sem o lançamento marcado", () => {
    for (const fn of [
      (s: typeof without) => totals(listTransactions(s)),
      (s: typeof without) => monthlyTotals(listTransactions(s), lastMonths("2026-09-30", 6)),
      (s: typeof without) => spendingPace(listTransactions(s), "2026-09", "2026-09-30"),
      (s: typeof without) => categoryBreakdown(listTransactions(s), s),
      (s: typeof without) => cashbackSummary(listTransactions(s), s),
      (s: typeof without) => estimatedTotals(listTransactions(s)),
      (s: typeof without) => availableBalance(s),
    ]) {
      expect(fn(marked)).toEqual(fn(without));
    }
  });

  it("a comparação com o mês anterior ignora o marcado nos dois meses", () => {
    const a = monthComparison(listTransactions(marked), "2026-09");
    const b = monthComparison(listTransactions(without), "2026-09");
    expect({ ...a, count: 0 }).toEqual({ ...b, count: 0 });
  });

  it("o custo essencial não soma o marcado", () => {
    const cost = (s: typeof without) => essentialCost(s, ["ALI"], "2026-10-15");
    expect(cost(marked)).toBe(cost(without));
  });

  it("desmarcar devolve o valor", () => {
    const back = stateOf({
      transactions: [...base, tx("FAT", "expense", 300_000, "2026-09-10", "ALI")],
    });
    expect(totals(listTransactions(back)).expenseMinor).toBe(400_000);
  });
});

describe("countsInTotals", () => {
  it("só os dois estados conhecidos tiram da conta", () => {
    expect(countsInTotals({})).toBe(true);
    expect(countsInTotals({ reportState: null })).toBe(true);
    expect(countsInTotals({ reportState: "transfer" })).toBe(false);
    expect(countsInTotals({ reportState: "hidden" })).toBe(false);
  });

  it("valor desconhecido de uma versão futura conta como normal", () => {
    const future = { reportState: "archived" } as unknown as { reportState: "hidden" };
    expect(countsInTotals(future)).toBe(true);
  });
});
