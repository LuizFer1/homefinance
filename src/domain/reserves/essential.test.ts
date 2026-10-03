import { describe, expect, it } from "vitest";
import { EMPTY_APP_STATE } from "../model/app-state";
import type { Category } from "../model/category";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { emergencyTarget, essentialCost, findEssentialCategoryIds } from "./essential";
import { reserve, stateOf, tx } from "./fixtures.fake";

const cat = (id: string, name: string, extra: Partial<Category> = {}): Category => ({
  ...ALIVE,
  id,
  name,
  icon: "tag",
  color: "slate",
  kind: "expense",
  ...extra,
});

describe("findEssentialCategoryIds", () => {
  it("acha pelo nome sem acento e sem caixa, só categorias vivas", () => {
    const state = {
      ...EMPTY_APP_STATE,
      categories: {
        A: cat("A", "moradia"),
        B: cat("B", "ALIMENTACAO"),
        C: cat("C", "Saúde", { deletedAt: DELETED_AT }),
        D: cat("D", "Lazer"),
        E: cat("E", "Contas"),
      },
    };
    expect(findEssentialCategoryIds(state).sort()).toEqual(["A", "B", "E"]);
  });
});

describe("essentialCost", () => {
  const today = "2026-10-15";

  it("média dos 6 meses anteriores ao atual, só nas categorias pedidas", () => {
    const state = stateOf({
      transactions: [
        tx("T1", "expense", 60_000, "2026-04-10", "MOR"),
        tx("T2", "expense", 60_000, "2026-09-10", "MOR"),
        tx("T3", "expense", 999_999, "2026-10-01", "MOR"), // mês atual: fora
        tx("T4", "expense", 50_000, "2026-09-12", "LAZ"), // categoria fora
        tx("T5", "expense", 30_000, "2026-03-31", "MOR"), // 7 meses atrás: fora
        tx("T6", "income", 10_000, "2026-03-01"),
      ],
    });
    expect(essentialCost(state, ["MOR"], today)).toBe(20_000); // 120000 / 6
  });

  it("com menos de 6 meses de histórico divide pelos meses desde o primeiro lançamento", () => {
    const state = stateOf({
      transactions: [
        tx("T1", "income", 1, "2026-08-02"),
        tx("T2", "expense", 30_000, "2026-08-10", "MOR"),
        tx("T3", "expense", 50_000, "2026-09-10", "MOR"),
      ],
    });
    expect(essentialCost(state, ["MOR"], today)).toBe(40_000);
  });

  it("sem nenhum mês completo é null", () => {
    const state = stateOf({ transactions: [tx("T1", "expense", 1, "2026-10-02", "MOR")] });
    expect(essentialCost(state, ["MOR"], today)).toBeNull();
    expect(essentialCost(stateOf({}), ["MOR"], today)).toBeNull();
  });

  it("estimativa de série variável entra; apagado não", () => {
    const state = stateOf({
      transactions: [
        tx("T0", "income", 1, "2026-04-01"),
        tx("T1", "expense", 60_000, "2026-09-10", "MOR", { estimated: true }),
        tx("T2", "expense", 60_000, "2026-09-11", "MOR", { deletedAt: DELETED_AT }),
      ],
    });
    expect(essentialCost(state, ["MOR"], today)).toBe(10_000);
  });
});

describe("emergencyTarget", () => {
  const today = "2026-10-15";
  const state = stateOf({
    transactions: [
      tx("T0", "income", 1, "2026-04-01"),
      tx("T1", "expense", 2_370_000, "2026-09-10", "MOR"),
    ],
  });

  it("custo × múltiplo", () => {
    const r = reserve("E", { kind: "emergency", multiple: 6, essentialCategoryIds: ["MOR"] });
    expect(emergencyTarget(state, r, today)).toEqual({
      costMinor: 395_000,
      targetMinor: 2_370_000,
    });
  });

  it("o custo manual vence o calculado", () => {
    const r = reserve("E", {
      kind: "emergency",
      multiple: 3,
      essentialCategoryIds: ["MOR"],
      essentialOverrideMinor: 100_000,
    });
    expect(emergencyTarget(state, r, today)).toEqual({ costMinor: 100_000, targetMinor: 300_000 });
  });

  it("sem custo (ou custo zero) é null", () => {
    const r = reserve("E", { kind: "emergency", multiple: 6, essentialCategoryIds: [] });
    expect(emergencyTarget(stateOf({}), r, today)).toBeNull();
    expect(emergencyTarget(state, r, today)).toBeNull();
  });
});
