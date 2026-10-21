import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { Budget } from "../model/budget";
import type { Category } from "../model/category";
import type { Transaction } from "../model/transaction";
import { filterByMonth } from "../projections/breakdown";
import { findCategory } from "../projections/selectors";
import { countsInTotals } from "../transactions/counts-in-totals";
import { listBudgets } from "./list";

/**
 * A partir daqui a meta entra em atenção. É o aviso da Home e do Dashboard, não um
 * bloqueio: nada no app impede um gasto acima da meta.
 */
export const BUDGET_WARN_RATIO = 0.8;

export type BudgetLevel = "ok" | "warning" | "over";

export interface BudgetStatus {
  budget: Budget;
  category: Category;
  limitMinor: number;
  spentMinor: number;
  /** `limite − gasto`; negativo quando estourou. */
  remainingMinor: number;
  /** `gasto / limite`, sem teto: passa de 1 quando estoura. */
  usedRatio: number;
  level: BudgetLevel;
  /** Quanto passou da meta; 0 enquanto não estourou. */
  overMinor: number;
  count: number;
}

/** Gasto do mês numa categoria que não tem meta. */
export interface UnbudgetedSpend {
  /** `null` = "Sem categoria" (sem categoria ou apontando para uma apagada): não dá para ter meta. */
  category: Category | null;
  spentMinor: number;
  count: number;
}

export interface BudgetReport {
  rows: BudgetStatus[];
  unbudgeted: UnbudgetedSpend[];
}

export function levelOf(spentMinor: number, limitMinor: number): BudgetLevel {
  if (spentMinor > limitMinor) return "over";
  return spentMinor >= limitMinor * BUDGET_WARN_RATIO ? "warning" : "ok";
}

/**
 * Metas contra o gasto de um mês.
 *
 * O gasto é o mesmo de `categoryBreakdown`: só despesa, só o que conta nos totais
 * (transferência e oculto ficam de fora) e categoria apagada cai em "Sem
 * categoria". Se a meta usasse outra conta, o Dashboard e a tela de orçamento
 * discordariam sobre quanto se gastou.
 */
export function budgetReport(items: Transaction[], state: AppState, month: string): BudgetReport {
  const sums = new Map<Ulid | null, { spentMinor: number; count: number }>();
  for (const item of filterByMonth(items, month)) {
    if (item.kind !== "expense" || !countsInTotals(item)) continue;
    const id = findCategory(state, item.categoryId)?.id ?? null;
    const sum = sums.get(id) ?? { spentMinor: 0, count: 0 };
    sum.spentMinor += item.amountMinor;
    sum.count += 1;
    sums.set(id, sum);
  }

  const budgets = listBudgets(state);
  const budgeted = new Set(budgets.map((budget) => budget.categoryId));

  const rows: BudgetStatus[] = [];
  for (const budget of budgets) {
    const category = findCategory(state, budget.categoryId);
    if (category === null) continue;
    const { spentMinor, count } = sums.get(budget.categoryId) ?? { spentMinor: 0, count: 0 };
    rows.push({
      budget,
      category,
      limitMinor: budget.limitMinor,
      spentMinor,
      remainingMinor: budget.limitMinor - spentMinor,
      usedRatio: spentMinor / budget.limitMinor,
      level: levelOf(spentMinor, budget.limitMinor),
      overMinor: Math.max(0, spentMinor - budget.limitMinor),
      count,
    });
  }
  // Quem está mais perto (ou além) da meta primeiro; empate pelo nome.
  rows.sort(
    (a, b) => b.usedRatio - a.usedRatio || a.category.name.localeCompare(b.category.name, "pt-BR"),
  );

  const unbudgeted: UnbudgetedSpend[] = [];
  for (const [id, { spentMinor, count }] of sums) {
    if (id !== null && budgeted.has(id)) continue;
    unbudgeted.push({ category: id === null ? null : findCategory(state, id), spentMinor, count });
  }
  unbudgeted.sort((a, b) => b.spentMinor - a.spentMinor);

  return { rows, unbudgeted };
}

/** Metas que pedem atenção (a partir de `BUDGET_WARN_RATIO`), as estouradas primeiro. */
export function budgetAlerts(rows: BudgetStatus[]): BudgetStatus[] {
  return rows.filter((row) => row.level !== "ok");
}
