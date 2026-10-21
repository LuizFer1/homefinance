import { describe, expect, it } from "vitest";
import { EMPTY_APP_STATE } from "../model/app-state";
import type { Budget } from "../model/budget";
import type { Category } from "../model/category";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { tx } from "../reserves/fixtures.fake";
import { BUDGET_WARN_RATIO, budgetAlerts, budgetReport } from "./status";

const category = (id: string, extra: Partial<Category> = {}): Category => ({
  ...ALIVE,
  id,
  name: id,
  icon: "tag",
  color: "sky",
  kind: "expense",
  ...extra,
});

const budget = (categoryId: string, limitMinor: number): Budget => ({
  ...ALIVE,
  id: `B-${categoryId}`,
  categoryId,
  limitMinor,
});

function stateOf(budgets: Budget[], categories: Category[]) {
  return {
    ...EMPTY_APP_STATE,
    budgets: Object.fromEntries(budgets.map((b) => [b.id, b])),
    categories: Object.fromEntries(categories.map((c) => [c.id, c])),
  };
}

const MONTH = "2026-09";

describe("budgetReport", () => {
  const state = stateOf(
    [budget("FOOD", 100_000), budget("FUN", 20_000), budget("CAR", 50_000)],
    [category("FOOD"), category("FUN"), category("CAR"), category("PET")],
  );

  it("gasto, restante, uso e número de lançamentos de cada meta", () => {
    const { rows } = budgetReport(
      [
        tx("a", "expense", 30_000, "2026-09-02", "FOOD"),
        tx("b", "expense", 25_000, "2026-09-09", "FOOD"),
      ],
      state,
      MONTH,
    );
    const food = rows.find((row) => row.category.id === "FOOD");
    expect(food).toMatchObject({
      limitMinor: 100_000,
      spentMinor: 55_000,
      remainingMinor: 45_000,
      usedRatio: 0.55,
      level: "ok",
      overMinor: 0,
      count: 2,
    });
  });

  it("meta sem gasto aparece zerada", () => {
    const { rows } = budgetReport([], state, MONTH);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.spentMinor === 0 && row.level === "ok")).toBe(true);
  });

  it("estourar é informação: passa de 100% e diz quanto passou", () => {
    const { rows } = budgetReport([tx("a", "expense", 35_000, "2026-09-02", "FUN")], state, MONTH);
    expect(rows[0]).toMatchObject({
      category: { id: "FUN" },
      remainingMinor: -15_000,
      overMinor: 15_000,
      level: "over",
    });
    expect(rows[0]?.usedRatio).toBeCloseTo(1.75);
  });

  it("no limite exato é atenção, não estouro", () => {
    const { rows } = budgetReport([tx("a", "expense", 20_000, "2026-09-02", "FUN")], state, MONTH);
    expect(rows[0]).toMatchObject({ level: "warning", overMinor: 0, remainingMinor: 0 });
  });

  it("só conta despesa do mês pedido", () => {
    const { rows } = budgetReport(
      [
        tx("a", "income", 90_000, "2026-09-02", "FOOD"),
        tx("b", "expense", 90_000, "2026-08-30", "FOOD"),
        tx("c", "expense", 10_000, "2026-09-30", "FOOD"),
      ],
      state,
      MONTH,
    );
    expect(rows.find((row) => row.category.id === "FOOD")?.spentMinor).toBe(10_000);
  });

  it("transferência e oculto não entram no gasto da meta", () => {
    const { rows } = budgetReport(
      [
        tx("a", "expense", 80_000, "2026-09-02", "FOOD", { reportState: "transfer" }),
        tx("b", "expense", 80_000, "2026-09-03", "FOOD", { reportState: "hidden" }),
        tx("c", "expense", 5_000, "2026-09-04", "FOOD"),
      ],
      state,
      MONTH,
    );
    const food = rows.find((row) => row.category.id === "FOOD");
    expect(food).toMatchObject({ spentMinor: 5_000, count: 1 });
  });

  it("ordena do mais perto da meta para o mais longe", () => {
    const { rows } = budgetReport(
      [
        tx("a", "expense", 10_000, "2026-09-02", "FOOD"),
        tx("b", "expense", 30_000, "2026-09-02", "FUN"),
        tx("c", "expense", 40_000, "2026-09-02", "CAR"),
      ],
      state,
      MONTH,
    );
    expect(rows.map((row) => row.category.id)).toEqual(["FUN", "CAR", "FOOD"]);
  });

  it("gasto em categoria sem meta vai para a seção própria", () => {
    const { unbudgeted } = budgetReport(
      [
        tx("a", "expense", 7_000, "2026-09-02", "PET"),
        tx("b", "expense", 3_000, "2026-09-03", "PET"),
        tx("c", "expense", 500, "2026-09-03", "FOOD"),
      ],
      state,
      MONTH,
    );
    expect(unbudgeted).toEqual([
      { category: expect.objectContaining({ id: "PET" }), spentMinor: 10_000, count: 2 },
    ]);
  });

  it("sem categoria e categoria apagada somam em 'Sem categoria'", () => {
    const withDead = stateOf(
      [budget("FOOD", 100_000)],
      [category("FOOD"), category("OLD", { deletedAt: DELETED_AT })],
    );
    const { unbudgeted } = budgetReport(
      [
        tx("a", "expense", 1_000, "2026-09-02", null),
        tx("b", "expense", 2_000, "2026-09-02", "OLD"),
        tx("c", "expense", 4_000, "2026-09-02", "GONE"),
      ],
      withDead,
      MONTH,
    );
    expect(unbudgeted).toEqual([{ category: null, spentMinor: 7_000, count: 3 }]);
  });

  it("meta de categoria apagada não aparece, e o gasto vai para 'Sem categoria'", () => {
    const dead = stateOf([budget("OLD", 50_000)], [category("OLD", { deletedAt: DELETED_AT })]);
    const report = budgetReport([tx("a", "expense", 1_000, "2026-09-02", "OLD")], dead, MONTH);
    expect(report.rows).toEqual([]);
    expect(report.unbudgeted).toHaveLength(1);
  });

  it("sem metas e sem gasto, tudo vazio", () => {
    expect(budgetReport([], EMPTY_APP_STATE, MONTH)).toEqual({ rows: [], unbudgeted: [] });
  });
});

describe("budgetAlerts", () => {
  const state = stateOf(
    [budget("A", 10_000), budget("B", 10_000), budget("C", 10_000)],
    [category("A"), category("B"), category("C")],
  );

  it(`avisa a partir de ${BUDGET_WARN_RATIO * 100}% e quando estoura, estouradas primeiro`, () => {
    const { rows } = budgetReport(
      [
        tx("a", "expense", 8_500, "2026-09-02", "A"),
        tx("b", "expense", 12_000, "2026-09-02", "B"),
        tx("c", "expense", 7_900, "2026-09-02", "C"),
      ],
      state,
      MONTH,
    );
    const alerts = budgetAlerts(rows);
    expect(alerts.map((row) => [row.category.id, row.level])).toEqual([
      ["B", "over"],
      ["A", "warning"],
    ]);
  });

  it("sem metas em risco, nada", () => {
    expect(budgetAlerts(budgetReport([], state, MONTH).rows)).toEqual([]);
  });
});
