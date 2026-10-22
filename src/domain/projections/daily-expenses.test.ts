import { describe, expect, it } from "vitest";
import { EMPTY_APP_STATE } from "../model/app-state";
import { ALIVE } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { dailyExpenses, expensesOn, HEAT_LEVELS, heatLevel } from "./daily-expenses";

function record(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    kind: "expense",
    description: "Mercado",
    amountMinor: 1000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: "2026-09-07",
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
    ...ALIVE,
    ...overrides,
  };
}

describe("dailyExpenses", () => {
  it("soma por dia e ignora receita e outros meses", () => {
    const result = dailyExpenses(
      [
        record({ id: "a", occurredOn: "2026-09-03", amountMinor: 500 }),
        record({ id: "b", occurredOn: "2026-09-03", amountMinor: 700 }),
        record({ id: "c", occurredOn: "2026-09-10", amountMinor: 300 }),
        record({ id: "d", occurredOn: "2026-09-10", kind: "income", amountMinor: 9999 }),
        record({ id: "e", occurredOn: "2026-08-31", amountMinor: 9999 }),
      ],
      "2026-09",
    );
    expect(result.byDay).toHaveLength(30);
    expect(result.byDay[2]).toBe(1200);
    expect(result.byDay[9]).toBe(300);
    expect(result.maxMinor).toBe(1200);
    expect(result.peakDay).toBe(3);
  });

  it("respeita conta nos totais: transferencia e oculto ficam de fora", () => {
    const result = dailyExpenses(
      [
        record({ id: "a", amountMinor: 100 }),
        record({ id: "b", amountMinor: 5000, reportState: "transfer" }),
        record({ id: "c", amountMinor: 5000, reportState: "hidden" }),
      ],
      "2026-09",
    );
    expect(result.byDay[6]).toBe(100);
  });

  it("media e dias sem saida usam so os dias que ja aconteceram", () => {
    const items = [
      record({ id: "a", occurredOn: "2026-09-01", amountMinor: 1000 }),
      record({ id: "b", occurredOn: "2026-09-03", amountMinor: 2000 }),
    ];
    const result = dailyExpenses(items, "2026-09", 4);
    expect(result.elapsedDays).toBe(4);
    expect(result.averageMinor).toBe(750);
    expect(result.emptyDays).toBe(2);
  });

  it("mes sem saida e mes futuro nao dividem por zero", () => {
    expect(dailyExpenses([], "2026-09")).toMatchObject({
      peakDay: null,
      averageMinor: 0,
      emptyDays: 30,
    });
    expect(dailyExpenses([], "2026-12", 0)).toMatchObject({ averageMinor: 0, emptyDays: 0 });
  });

  it("empate no maior dia fica com o primeiro", () => {
    const result = dailyExpenses(
      [
        record({ id: "a", occurredOn: "2026-09-09", amountMinor: 100 }),
        record({ id: "b", occurredOn: "2026-09-02", amountMinor: 100 }),
      ],
      "2026-09",
    );
    expect(result.peakDay).toBe(2);
  });
});

describe("heatLevel", () => {
  it("zero sem saida, e qualquer saida fica de 1 ao teto", () => {
    expect(heatLevel(0, 1000)).toBe(0);
    expect(heatLevel(1, 100000)).toBe(1);
    expect(heatLevel(1000, 1000)).toBe(HEAT_LEVELS);
    expect(heatLevel(500, 1000)).toBe(2);
    expect(heatLevel(501, 1000)).toBe(3);
  });
});

describe("expensesOn", () => {
  it("lista so despesas que contam, do dia pedido", () => {
    const items = [
      record({ id: "a", occurredOn: "2026-09-07", amountMinor: 100 }),
      record({ id: "b", occurredOn: "2026-09-07", kind: "income" }),
      record({ id: "c", occurredOn: "2026-09-07", reportState: "transfer" }),
      record({ id: "d", occurredOn: "2026-09-08" }),
    ];
    expect(expensesOn(items, "2026-09-07", EMPTY_APP_STATE).map((row) => row.id)).toEqual(["a"]);
  });
});
