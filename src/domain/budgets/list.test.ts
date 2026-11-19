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

  // Regra R (spec do id estável, §4.3 e §8): os mesmos vetores R1, R2 e R4 do hub
  // (`budgets.rs`, `regra_r`). O R3 do hub (sem `updatedAt` perde) não tem par: no app toda
  // meta gravada tem versão.
  describe("regra R: mesma categoria", () => {
    const CATEGORY = "01JZ0000000000000000000CT1";
    const ID_A = "01JZ000000000000000000BGTA";
    const ID_B = "01JZ000000000000000000BGTB";
    const H1 = "1793000000000-0000-01JZ0000000000000000000DV1";
    const H2 = "1793000000000-0001-01JZ0000000000000000000DV2";

    const linha = (id: string, updatedAt: string, limitMinor: number, deleted = false) =>
      budget(id, CATEGORY, { updatedAt, limitMinor, deletedAt: deleted ? updatedAt : null });

    const vencedor = (a: Budget, b: Budget) => {
      const limite = (x: Budget, y: Budget) => {
        const atual = listBudgets(state([x, y], [category(CATEGORY)]));
        expect(atual).toHaveLength(1);
        return atual[0]?.limitMinor;
      };
      const ida = limite(a, b);
      expect(limite(b, a)).toBe(ida);
      return ida;
    };

    it("R1: vale a de updatedAt maior, mesmo com o id menor", () => {
      expect(vencedor(linha(ID_A, H2, 20_000), linha(ID_B, H1, 30_000))).toBe(20_000);
    });

    it("R2: empate de updatedAt, vale a de id maior", () => {
      expect(vencedor(linha(ID_A, H1, 20_000), linha(ID_B, H1, 30_000))).toBe(30_000);
    });

    it("R4: apagada não concorre, mesmo mais nova", () => {
      expect(vencedor(linha(ID_A, H2, 20_000, true), linha(ID_B, H1, 30_000))).toBe(30_000);
    });
  });
});
