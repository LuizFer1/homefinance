import { describe, expect, it } from "vitest";
import { EMPTY_APP_STATE } from "../model/app-state";
import type { Budget } from "../model/budget";
import type { Category } from "../model/category";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { budgetIdFor } from "./budget-id";
import { budgetOf, listBudgets } from "./list";

const category = (id: string, extra: Partial<Category> = {}): Category => ({
  ...ALIVE,
  id,
  name: id,
  icon: "tag",
  color: "sky",
  kind: "expense",
  ...extra,
});

const budget = (id: string, categoryId: string, extra: Partial<Budget> = {}): Budget => ({
  ...ALIVE,
  id,
  categoryId,
  limitMinor: 50_000,
  ...extra,
});

const state = (budgets: Budget[], categories: Category[]) => ({
  ...EMPTY_APP_STATE,
  budgets: Object.fromEntries(budgets.map((b) => [b.id, b])),
  categories: Object.fromEntries(categories.map((c) => [c.id, c])),
});

describe("budgetIdFor", () => {
  it("é o mesmo em qualquer aparelho e distinto entre categorias", () => {
    expect(budgetIdFor("CAT-A")).toBe(budgetIdFor("CAT-A"));
    expect(budgetIdFor("CAT-A")).not.toBe(budgetIdFor("CAT-B"));
    expect(budgetIdFor("CAT-A")).toHaveLength(26);
  });
});

describe("listBudgets", () => {
  it("lista as metas vivas de categorias vivas", () => {
    const s = state([budget("B1", "A"), budget("B2", "B")], [category("A"), category("B")]);
    expect(listBudgets(s).map((b) => b.id)).toEqual(["B1", "B2"]);
  });

  it("meta apagada some", () => {
    const s = state([budget("B1", "A", { deletedAt: DELETED_AT })], [category("A")]);
    expect(listBudgets(s)).toEqual([]);
  });

  it("categoria apagada ou inexistente esconde a meta, sem apagá-la", () => {
    const s = state(
      [budget("B1", "A"), budget("B2", "GONE")],
      [category("A", { deletedAt: DELETED_AT })],
    );
    expect(listBudgets(s)).toEqual([]);
    expect(s.budgets.B1?.deletedAt).toBeNull();
  });

  it("duas metas da mesma categoria (pós-fusão): vale a mais recente", () => {
    const s = state(
      [
        budget("OLD", "A", { limitMinor: 10_000, updatedAt: "1754568000000-0000-AAA" }),
        budget("NEW", "A", { limitMinor: 20_000, updatedAt: "1754568000005-0000-AAA" }),
      ],
      [category("A")],
    );
    expect(listBudgets(s).map((b) => b.id)).toEqual(["NEW"]);
    expect(budgetOf(s, "A")?.limitMinor).toBe(20_000);
    expect(budgetOf(s, "B")).toBeNull();
  });
});
