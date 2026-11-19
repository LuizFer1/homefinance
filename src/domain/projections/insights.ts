import { lastDayOfMonth } from "../dates/business-day";
import { shiftMonth } from "../dates/calendar";
import type { AppState } from "../model/app-state";
import { NEUTRAL_TOKEN } from "../model/tokens";
import type { Transaction } from "../model/transaction";
import { offersCashback } from "../transactions/cashback";
import { countsInTotals } from "../transactions/counts-in-totals";
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
  /**
   * "Seu normal" do saldo: média do saldo dos meses de referência (os 3 anteriores
   * com dado, `referenceMonths`). `null` sem mês de referência.
   */
  normalBalanceMinor: number | null;
  /** Saldo do mês menos o normal. Positivo = sobrou mais. `null` sem normal. */
  deltaMinor: number | null;
  /** Lançamentos no mês. */
  count: number;
}

/**
 * O "como estou indo" do cartão de saldo: o número sozinho não diz se o mês foi
 * bom, a diferença para o normal diz. A régua é a média dos 3 meses anteriores, e
 * não só o anterior: um mês atípico (13º, viagem, IPVA) não vira a régua do
 * seguinte. Só faz sentido em mês fechado — no corrente, parcial contra inteiro
 * sempre parece "gastei muito menos"; a tela esconde a linha ali.
 */
export function monthComparison(items: Transaction[], month: string): MonthComparison {
  const monthItems = filterByMonth(items, month);
  const current = totals(monthItems);
  const months = referenceMonths(items, month);
  const normalBalanceMinor =
    months.length === 0
      ? null
      : Math.round(
          months.reduce((acc, m) => acc + totals(filterByMonth(items, m)).balanceMinor, 0) /
            months.length,
        );

  return {
    current,
    normalBalanceMinor,
    deltaMinor: normalBalanceMinor === null ? null : current.balanceMinor - normalBalanceMinor,
    count: monthItems.length,
  };
}

/** Despesa acumulada ao fim de cada dia do mês (índice 0 = dia 1). */
function cumulativeExpense(items: Transaction[], month: string): number[] {
  const daily = new Array<number>(daysInMonth(month)).fill(0);

  for (const item of filterByMonth(items, month)) {
    if (item.kind !== "expense" || !countsInTotals(item)) continue;
    const index = Number(item.occurredOn.slice(8, 10)) - 1;
    if (index >= 0 && index < daily.length) daily[index] = (daily[index] ?? 0) + item.amountMinor;
  }

  let running = 0;
  return daily.map((value) => {
    running += value;
    return running;
  });
}

/** Quantos meses anteriores formam "o seu normal". */
export const NORMAL_MONTHS = 3;

/**
 * Mês ('YYYY-MM') do primeiro lançamento vivo, conte ele nos totais ou não.
 * `null` sem lançamento. É o começo do histórico: mês anterior a ele "não
 * existia", não "gastou zero".
 */
export function firstMonthOf(items: Transaction[]): string | null {
  let first: string | null = null;
  for (const item of items) {
    const month = monthOf(item.occurredOn);
    if (first === null || month < first) first = month;
  }
  return first;
}

/**
 * Meses que formam "o seu normal" de `month`: os 3 anteriores, do mais antigo ao
 * mais novo, só os que são do primeiro lançamento em diante (mesma regra do custo
 * essencial). Dividir por 3 com um mês de histórico daria um normal três vezes
 * menor que o real e todo mês pareceria "muito acima". Um mês vazio **depois**
 * do primeiro lançamento conta, valendo zero: ele existiu.
 */
export function referenceMonths(items: Transaction[], month: string): string[] {
  const first = firstMonthOf(items);
  if (first === null) return [];
  const months: string[] = [];
  for (let back = NORMAL_MONTHS; back >= 1; back -= 1) {
    const candidate = shiftMonth(month, -back);
    if (candidate >= first) months.push(candidate);
  }
  return months;
}

export interface SpendingPace {
  /** Acumulado por dia no mês escolhido. */
  current: number[];
  /**
   * "Seu normal": média, dia a dia, do acumulado dos meses de referência, com um
   * valor por dia do mês escolhido. Vazio quando não há mês de referência.
   */
  normal: number[];
  /** Meses que entram no normal, do mais antigo ao mais novo. */
  referenceMonths: string[];
  /** Último dia que já aconteceu: hoje no mês corrente, o fim num mês passado. */
  cutoff: number;
  spentMinor: number;
  /** Normal no dia do corte; `null` sem mês de referência. */
  normalAtCutoffMinor: number | null;
  /** Variação contra o normal no mesmo dia; `null` sem normal ou com normal zero. */
  change: number | null;
  /**
   * `change` em porcentagem inteira, com sinal (`Math.round`, igual ao `js_round` do
   * hub). Arredondar o módulo divergiria do hub em −x,5 e poderia escrever "0% acima".
   */
  changePercent: number | null;
}

/**
 * Ritmo de gastos: quanto já saiu até hoje contra "o seu normal" no mesmo dia —
 * a média dos 3 meses anteriores com dado.
 *
 * Comparar com o total de um mês seria injusto no dia 10 — sempre daria "muito
 * abaixo". O ponto de comparação é o mesmo dia; num mês de referência mais curto
 * (31 de março contra fevereiro), vale o último dia dele. E a média de 3 meses,
 * não só o anterior: um mês atípico (13º, viagem) não vira a régua do seguinte.
 */
export function spendingPace(items: Transaction[], month: string, today: string): SpendingPace {
  const current = cumulativeExpense(items, month);
  const thisMonth = monthOf(today);
  const months = referenceMonths(items, month);
  const curves = months.map((reference) => cumulativeExpense(items, reference));
  const normal =
    curves.length === 0
      ? []
      : current.map((_, index) => {
          const day = index + 1;
          const sum = curves.reduce(
            (acc, curve) => acc + (curve[Math.min(day, curve.length) - 1] ?? 0),
            0,
          );
          return Math.round(sum / curves.length);
        });

  const cutoff =
    month === thisMonth ? Number(today.slice(8, 10)) : month < thisMonth ? current.length : 0;
  const spentMinor = cutoff === 0 ? 0 : (current[cutoff - 1] ?? 0);
  const normalAtCutoffMinor =
    normal.length === 0 ? null : cutoff === 0 ? 0 : (normal[cutoff - 1] ?? 0);
  // Mesma conta do hub (`gasto ÷ normal − 1`), para o ponto flutuante dar o mesmo resultado.
  const change =
    normalAtCutoffMinor === null || normalAtCutoffMinor === 0
      ? null
      : spentMinor / normalAtCutoffMinor - 1;

  return {
    current,
    normal,
    referenceMonths: months,
    cutoff,
    spentMinor,
    normalAtCutoffMinor,
    change,
    changePercent: change === null ? null : Math.round(change * 100),
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
    if (item.kind !== "expense" || !countsInTotals(item)) continue;
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
    if (!countsInTotals(item)) continue;
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

export interface SurplusAverage {
  /** Média da sobra (receita − despesa); negativa quando faltou. */
  averageMinor: number;
  /** Quantos meses entraram na média. */
  months: number;
}

/**
 * Quanto sobrou, em média, nos meses **fechados com dado** da janela: do mês do
 * primeiro lançamento (`firstMonth`) até o anterior ao corrente. Mês antes do
 * primeiro lançamento não existia — contá-lo como zero diluía a média (com 2 meses
 * de histórico numa janela de 6, a sobra saía um terço da real). O mês corrente
 * também fica de fora: pela metade, a receita já entrou e a despesa não. `null`
 * quando nenhum mês fechado sobra.
 */
export function averageSurplus(
  months: MonthTotals[],
  firstMonth: string | null,
  currentMonth: string,
): SurplusAverage | null {
  if (firstMonth === null) return null;
  const closed = months.filter((item) => item.month >= firstMonth && item.month < currentMonth);
  if (closed.length === 0) return null;
  const sum = closed.reduce((acc, item) => acc + item.incomeMinor - item.expenseMinor, 0);
  return { averageMinor: Math.round(sum / closed.length), months: closed.length };
}
