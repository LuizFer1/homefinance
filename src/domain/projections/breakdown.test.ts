import { describe, expect, it } from "vitest";
import { ALIVE } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { filterByMonth, monthlyTotals } from "./breakdown";

function record(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    kind: "expense",
    description: "Mercado",
    amountMinor: 1000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: "2026-08-07",
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
    ...ALIVE,
    ...overrides,
  };
}

describe("filterByMonth", () => {
  it("guarda só o mês pedido", () => {
    const items = [
      record({ id: "a", occurredOn: "2026-08-01" }),
      record({ id: "b", occurredOn: "2026-07-31" }),
      record({ id: "c", occurredOn: "2026-09-01" }),
    ];

    expect(filterByMonth(items, "2026-08").map((item) => item.id)).toEqual(["a"]);
  });
});

describe("monthlyTotals", () => {
  it("preenche com zero o mês sem lançamento", () => {
    // Sem o zero-fill o mês vazio some do array, as barras vizinhas encostam e
    // o eixo passa a mentir sobre o intervalo mostrado.
    const items = [
      record({ id: "a", occurredOn: "2026-06-10", amountMinor: 300 }),
      record({ id: "b", occurredOn: "2026-08-10", amountMinor: 500, kind: "income" }),
    ];

    expect(monthlyTotals(items, ["2026-06", "2026-07", "2026-08"])).toEqual([
      { month: "2026-06", incomeMinor: 0, expenseMinor: 300 },
      { month: "2026-07", incomeMinor: 0, expenseMinor: 0 },
      { month: "2026-08", incomeMinor: 500, expenseMinor: 0 },
    ]);
  });

  it("descarta lançamento fora da janela pedida", () => {
    const items = [record({ id: "a", occurredOn: "2020-01-10", amountMinor: 999 })];

    expect(monthlyTotals(items, ["2026-08"])).toEqual([
      { month: "2026-08", incomeMinor: 0, expenseMinor: 0 },
    ]);
  });
});
