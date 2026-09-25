import { describe, expect, it } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Category } from "../model/category";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { buildCategoryIndex, normalizeDescription, suggestCategory } from "./suggest-category";

function category(id: string, deleted = false): Category {
  return {
    ...ALIVE,
    id,
    name: id,
    icon: "tag",
    color: "slate",
    kind: "expense",
    deletedAt: deleted ? DELETED_AT : null,
  };
}

function tx(id: string, description: string, categoryId: string | null, occurredOn: string) {
  const row: Transaction = {
    ...ALIVE,
    id,
    kind: "expense",
    description,
    amountMinor: 100,
    currency: "BRL",
    categoryId,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn,
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
  };
  return row;
}

function stateWith(transactions: Transaction[], categories: Category[]): AppState {
  return {
    ...EMPTY_APP_STATE,
    transactions: Object.fromEntries(transactions.map((t) => [t.id, t])),
    categories: Object.fromEntries(categories.map((c) => [c.id, c])),
  };
}

describe("normalizeDescription", () => {
  it("tira acento, pontuação e, opcionalmente, dígitos", () => {
    expect(normalizeDescription("Pão de Açúcar *123")).toBe("PAO DE ACUCAR 123");
    expect(normalizeDescription("Uber *Trip 1234", false)).toBe("UBER TRIP");
  });
});

describe("suggestCategory", () => {
  const state = stateWith(
    [
      tx("t1", "IFOOD *RESTAURANTE A", "ALIM", "2026-08-01"),
      tx("t2", "Uber *Trip 1111", "OLD", "2026-07-01"),
      tx("t3", "UBER TRIP 2222", "TRANSP", "2026-08-01"),
      tx("t4", "Farmácia X", "APAGADA", "2026-08-01"),
    ],
    [category("ALIM"), category("OLD"), category("TRANSP"), category("APAGADA", true)],
  );
  const index = buildCategoryIndex(state);

  it("casa a descrição inteira, e o mais recente vence", () => {
    expect(suggestCategory(index, "UBER *TRIP 9999", "expense")).toBe("TRANSP");
  });

  it("cai para a primeira palavra", () => {
    expect(suggestCategory(index, "IFOOD *OUTRO LUGAR", "expense")).toBe("ALIM");
  });

  it("não sugere categoria apagada, nem para outro tipo", () => {
    expect(suggestCategory(index, "FARMACIA X", "expense")).toBeNull();
    expect(suggestCategory(index, "IFOOD", "income")).toBeNull();
  });
});
