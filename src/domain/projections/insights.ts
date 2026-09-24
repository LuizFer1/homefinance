import { lastDayOfMonth } from "../dates/business-day";
import { shiftMonth } from "../dates/calendar";
import type { AppState } from "../model/app-state";
import { NEUTRAL_TOKEN } from "../model/tokens";
import type { Transaction } from "../model/transaction";
import { offersCashback } from "../transactions/cashback";
import { filterByMonth, type MonthTotals } from "./breakdown";
import { monthOf } from "./periods";
import { findCategory, type Totals, totals } from "./selectors";

/*
 * Recortes do Dashboard. Todas recebem os registros **já filtrados** por
 * `listTransactions` (visíveis) e nunca leem relógio: "hoje" e o mês chegam por
 * parâmetro, como no resto do domínio.
 */

/** Quantos dias o mês 'YYYY-MM' tem. */
export function daysInMonth(month: string): number {
  return Number(lastDayOfMonth(month).slice(8, 10));
}

export interface MonthComparison {
  current: Totals;
  previous: Totals;
  /** Saldo do mês menos o do anterior. Positivo = sobrou mais. */
  deltaMinor: number;
  /** Lançamentos no mês. */
  count: number;
}

/**
 * O "como estou indo" do cartão de saldo: o número sozinho não diz se o mês foi
 * bom, a diferença para o anterior diz.
 */
export function monthComparison(items: Transaction[], month: string): MonthComparison {
  const monthItems = filterByMonth(items, month);
  const current = totals(monthItems);
  const previous = totals(filterByMonth(items, shiftMonth(month, -1)));

  return {
    current,
    previous,
    deltaMinor: current.balanceMinor - previous.balanceMinor,
    count: monthItems.length,
  };
}

/** Despesa acumulada ao fim de cada dia do mês (índice 0 = dia 1). */
function cumulativeExpense(items: Transaction[], month: string): number[] {
  const daily = new Array<number>(daysInMonth(month)).fill(0);

  for (const item of filterByMonth(items, month)) {
    if (item.kind !== "expense") continue;
    const index = Number(item.occurredOn.slice(8, 10)) - 1;
    if (index >= 0 && index < daily.length) daily[index] = (daily[index] ?? 0) + item.amountMinor;
  }

  let running = 0;
  return daily.map((value) => {
    running += value;
    return running;
  });
}

export interface SpendingPace {
  /** Acumulado por dia no mês escolhido. */
  current: number[];
  /** Acumulado por dia no mês anterior, inteiro. */
  previous: number[];
  /** Último dia que já aconteceu: hoje no mês corrente, o fim num mês passado. */
  cutoff: number;
  spentMinor: number;
  previousAtCutoffMinor: number;
  /** Variação contra o anterior no mesmo dia; `null` se o anterior não gastou nada. */
  change: number | null;
}

/**
 * Ritmo de gastos: quanto já saiu até hoje contra quanto tinha saído até o
 * mesmo dia do mês anterior.
 *
 * Comparar com o total do mês anterior seria injusto no dia 10 — sempre daria
 * "muito abaixo". O ponto de comparação é o mesmo dia; se o anterior é mais
 * curto (31 de março contra fevereiro), vale o último dia dele.
 */
export function spendingPace(items: Transaction[], month: string, today: string): SpendingPace {
  const current = cumulativeExpense(items, month);
  const previous = cumulativeExpense(items, shiftMonth(month, -1));
  const thisMonth = monthOf(today);

  const cutoff =
    month === thisMonth ? Number(today.slice(8, 10)) : month < thisMonth ? current.length : 0;
  const spentMinor = cutoff === 0 ? 0 : (current[cutoff - 1] ?? 0);
  const previousAtCutoffMinor =
    cutoff === 0 ? 0 : (previous[Math.min(cutoff, previous.length) - 1] ?? 0);

  return {
    current,
    previous,
    cutoff,
    spentMinor,
    previousAtCutoffMinor,
    change:
      previousAtCutoffMinor === 0
        ? null
        : (spentMinor - previousAtCutoffMinor) / previousAtCutoffMinor,
  };
}

export interface CategoryShare {
  /** `null` = sem categoria (ou categoria apagada). */
  id: string | null;
  name: string;
  icon: string;
  color: string;
  amountMinor: number;
  /** Fração do total de despesa, 0..1. */
  share: number;
}

/**
 * "Para onde foi": toda categoria de despesa, sem o balde "Outras" da rosca.
 *
 * Aqui é lista, não fatia — dez linhas cabem e cada uma é informação. Categoria
 * apagada soma em "Sem categoria": o delete não cascateia, mas ícone e cor de
 * um registro morto não devem voltar à tela.
 */
export function categoryBreakdown(items: Transaction[], state: AppState): CategoryShare[] {
  const sums = new Map<string | null, number>();
  let total = 0;

  for (const item of items) {
    if (item.kind !== "expense") continue;
    const id = findCategory(state, item.categoryId)?.id ?? null;
    sums.set(id, (sums.get(id) ?? 0) + item.amountMinor);
    total += item.amountMinor;
  }

  if (total === 0) return [];

  return [...sums.entries()]
    .map(([id, amountMinor]) => {
      const category = id === null ? null : findCategory(state, id);
      return {
        id,
        name: category?.name ?? "Sem categoria",
        icon: category?.icon ?? "prohibit",
        color: category?.color ?? NEUTRAL_TOKEN,
        amountMinor,
        share: amountMinor / total,
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name, "pt-BR"));
}

export interface CashbackSummary {
  totalMinor: number;
  /** Compras (despesas) pagas em forma que admite cashback. */
  purchases: number;
}

/**
 * Cashback do período. Conta a compra pela **forma** (crédito/débito), não por
 * ter cashback preenchido: "9 compras no crédito e débito" é o universo em que
 * o cashback poderia ter vindo.
 */
export function cashbackSummary(items: Transaction[], state: AppState): CashbackSummary {
  let totalMinor = 0;
  let purchases = 0;

  for (const item of items) {
    const method =
      item.paymentMethodId === null ? undefined : state.paymentMethods[item.paymentMethodId];
    if (offersCashback(method?.kind ?? null, item.kind)) purchases += 1;
    if (item.kind === "expense" && item.cashbackMinor !== null) totalMinor += item.cashbackMinor;
  }

  return { totalMinor, purchases };
}

/**
 * Lançamentos por categoria ou forma de pagamento no mês — a meta "9
 * lançamentos no mês" do cadastro, que ajuda a decidir o que dá para excluir.
 */
export function categoryUsage(
  items: Transaction[],
  month: string,
  field: "categoryId" | "paymentMethodId",
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const item of filterByMonth(items, month)) {
    const id = item[field];
    if (id !== null) counts[id] = (counts[id] ?? 0) + 1;
  }

  return counts;
}

/** Quanto sobrou, em média, por mês da janela. */
export function averageSurplus(months: MonthTotals[]): number {
  if (months.length === 0) return 0;
  const sum = months.reduce((acc, month) => acc + month.incomeMinor - month.expenseMinor, 0);
  return Math.round(sum / months.length);
}
