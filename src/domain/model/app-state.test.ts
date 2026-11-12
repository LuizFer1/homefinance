import { describe, expect, it } from "vitest";
import { EMPTY_APP_STATE, isBookScoped, TABLE_NAMES } from "./app-state";

describe("TABLE_NAMES", () => {
  it("lista as doze tabelas de RowMap", () => {
    expect(TABLE_NAMES).toEqual([
      "users",
      "categories",
      "paymentMethods",
      "transactions",
      "recurrences",
      "recurrenceAdjustments",
      "reserves",
      "reserveMovements",
      "budgets",
      "books",
      "assets",
      "debts",
    ]);
  });
});

describe("isBookScoped", () => {
  it("só users e books valem nas duas contas; o resto pertence a uma conta", () => {
    const shared = TABLE_NAMES.filter((table) => !isBookScoped(table));
    expect(shared).toEqual(["users", "books"]);
  });
});

describe("EMPTY_APP_STATE", () => {
  it("é congelado: uma tentativa de mutação não altera o estado", () => {
    expect(Object.isFrozen(EMPTY_APP_STATE)).toBe(true);
    expect(Object.isFrozen(EMPTY_APP_STATE.categories)).toBe(true);

    expect(() => {
      // @ts-expect-error — mutação proposital para provar o freeze em runtime.
      EMPTY_APP_STATE.categories.X = { id: "X" };
    }).toThrow();
    expect(EMPTY_APP_STATE.categories).toEqual({});
  });
});
