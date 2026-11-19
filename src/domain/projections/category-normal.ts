import type { AppState } from "../model/app-state";
import type { Transaction } from "../model/transaction";
import { countsInTotals } from "../transactions/counts-in-totals";
import { filterByMonth } from "./breakdown";
import { daysInMonth, referenceMonths } from "./insights";
import { monthOf } from "./periods";
import { findCategory } from "./selectors";

/**
 * Acima do normal só a partir de +25% (`gasto × 4 ≥ normal × 5`) e de R$ 50 a mais:
 * R$ 8 → R$ 12 é +50%, mas não é alarme.
 */
export const ABOVE_NORMAL_MIN_MINOR = 5_000;

export interface CategoryNormal {
  /** Gasto da categoria no mês, até o mesmo dia no mês corrente. */
  spentMinor: number;
  /** Média dos meses de referência no mesmo recorte, arredondada ao centavo. */
  normalMinor: number;
  /** `(gasto ÷ normal − 1) × 100`, arredondado com sinal (igual ao hub). */
  changePercent: number;
}

/**
 * Soma por categoria das despesas que contam, com dia do mês até `throughDay`. A
 * chave é o id que `categoryBreakdown` põe na linha (categoria viva; apagada vira
 * `null`, "Sem categoria"), senão a marca não acharia a linha.
 */
function byCategory(
  items: Transaction[],
  state: AppState,
  month: string,
  throughDay: number,
): Map<string | null, number> {
  const sums = new Map<string | null, number>();
  for (const item of filterByMonth(items, month)) {
    if (item.kind !== "expense" || !countsInTotals(item)) continue;
    if (Number(item.occurredOn.slice(8, 10)) > throughDay) continue;
    const id = findCategory(state, item.categoryId)?.id ?? null;
    sums.set(id, (sums.get(id) ?? 0) + item.amountMinor);
  }
  return sums;
}

/**
 * Categorias que passaram do "seu normal" (indicadores §6.7; spec do hub 5.8): só as
 * marcadas, pelo id da linha.
 *
 * O normal tem a mesma referência do ritmo — os 3 meses anteriores com dado,
 * `referenceMonths` —, dividido pelos meses de referência (um mês vazio depois do
 * primeiro lançamento vale zero e divide). No mês corrente os dois lados param no
 * dia de hoje (a mesma ideia do ritmo: no dia 10 o mês inteiro sempre pareceria
 * barato); num mês fechado, mês inteiro contra mês inteiro. Normal zero não marca:
 * não há base para "x% acima".
 *
 * O normal é arredondado ao centavo **antes** dos dois limites, como o hub faz com
 * `div_round`; `gasto × 4 ≥ normal × 5` é o +25% sem ponto flutuante.
 */
export function categoriesAboveNormal(
  items: Transaction[],
  state: AppState,
  month: string,
  today: string,
): Map<string | null, CategoryNormal> {
  const thisMonth = monthOf(today);
  if (month > thisMonth) return new Map();
  const current = month === thisMonth;
  const throughDay = current ? Number(today.slice(8, 10)) : daysInMonth(month);
  const months = referenceMonths(items, month);
  const marked = new Map<string | null, CategoryNormal>();
  if (months.length === 0) return marked;

  // Mês fechado: o de referência entra inteiro (31 dias contra os 30 de novembro).
  const references = months.map((m) => byCategory(items, state, m, current ? throughDay : 31));
  for (const [id, spentMinor] of byCategory(items, state, month, throughDay)) {
    const sum = references.reduce((acc, sums) => acc + (sums.get(id) ?? 0), 0);
    const normalMinor = Math.round(sum / months.length);
    if (normalMinor <= 0) continue;
    if (spentMinor * 4 < normalMinor * 5) continue;
    if (spentMinor - normalMinor < ABOVE_NORMAL_MIN_MINOR) continue;
    marked.set(id, {
      spentMinor,
      normalMinor,
      changePercent: Math.round((spentMinor / normalMinor - 1) * 100),
    });
  }
  return marked;
}
