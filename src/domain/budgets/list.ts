import { compareHlc } from "../clock/hlc";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { Budget } from "../model/budget";
import { findCategory } from "../projections/selectors";

/**
 * Metas vivas, uma por categoria viva.
 *
 * Meta de categoria apagada some daqui: apagar não cascateia (a linha fica, e o
 * sync a propaga), mas uma meta sem categoria não tem o que mostrar. Depois de uma
 * fusão de padrões pode haver duas linhas para a mesma categoria; vale a de
 * `updatedAt` maior, a última que a pessoa mexeu.
 */
export function listBudgets(state: AppState): Budget[] {
  const byCategory = new Map<Ulid, Budget>();
  for (const budget of Object.values(state.budgets)) {
    if (!isAlive(budget) || findCategory(state, budget.categoryId) === null) continue;
    const current = byCategory.get(budget.categoryId);
    if (current === undefined || compareHlc(budget.updatedAt, current.updatedAt) > 0) {
      byCategory.set(budget.categoryId, budget);
    }
  }
  return [...byCategory.values()];
}

/** Meta vigente de uma categoria, ou `null`. */
export function budgetOf(state: AppState, categoryId: Ulid): Budget | null {
  return listBudgets(state).find((budget) => budget.categoryId === categoryId) ?? null;
}
