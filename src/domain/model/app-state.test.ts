import { describe, expect, it } from "vitest";
import { EMPTY_APP_STATE, TABLE_NAMES } from "./app-state";

describe("TABLE_NAMES", () => {
  it("lista as cinco tabelas de RowMap", () => {
    expect(TABLE_NAMES).toEqual([
      "users",
      "categories",
      "paymentMethods",
      "transactions",
      "recurrences",
    ]);
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
