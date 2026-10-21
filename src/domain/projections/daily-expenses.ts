import type { AppState } from "../model/app-state";
import type { Transaction } from "../model/transaction";
import { countsInTotals } from "../transactions/counts-in-totals";
import { filterByMonth } from "./breakdown";
import { filterTransactions, NO_FILTERS } from "./filter";
import { daysInMonth } from "./insights";

/** Degraus de intensidade do mapa de calor, de 1 (leve) a `HEAT_LEVELS` (pesado). */
export const HEAT_LEVELS = 4;

export interface DailyExpenses {
  /** Despesa de cada dia do mês (índice 0 = dia 1). */
  byDay: number[];
  /** Maior valor de um dia; 0 se o mês não tem saída. */
  maxMinor: number;
  /** Dia (1..n) do maior valor; `null` se não houve saída. */
  peakDay: number | null;
  /** Dias considerados nas médias: os que já aconteceram. */
  elapsedDays: number;
  /** Média por dia sobre `elapsedDays`; 0 quando nenhum dia aconteceu. */
  averageMinor: number;
  /** Dias já ocorridos sem nenhuma saída. */
  emptyDays: number;
}

/**
 * Despesa por dia do mês, para o mapa de calor.
 *
 * Passa pela mesma regra de `countsInTotals` do resto das projeções: transferência
 * e lançamento oculto não entram, senão o dia mais escuro do mapa discordaria do
 * total do card de saldo. `through` limita as médias aos dias que já aconteceram
 * (hoje no mês corrente): dividir pelo mês inteiro faria o mês em curso parecer
 * barato, e contar os dias futuros como "sem saída" seria mentira. Em empate no
 * maior valor, vale o primeiro dia.
 */
export function dailyExpenses(
  items: Transaction[],
  month: string,
  through = daysInMonth(month),
): DailyExpenses {
  const days = daysInMonth(month);
  const byDay = new Array<number>(days).fill(0);

  for (const item of filterByMonth(items, month)) {
    if (item.kind !== "expense" || !countsInTotals(item)) continue;
    const index = Number(item.occurredOn.slice(8, 10)) - 1;
    if (index >= 0 && index < days) byDay[index] = (byDay[index] ?? 0) + item.amountMinor;
  }

  const elapsedDays = Math.min(Math.max(through, 0), days);
  const elapsed = byDay.slice(0, elapsedDays);
  const spent = elapsed.reduce((sum, value) => sum + value, 0);
  const maxMinor = Math.max(0, ...byDay);

  return {
    byDay,
    maxMinor,
    peakDay: maxMinor === 0 ? null : byDay.indexOf(maxMinor) + 1,
    elapsedDays,
    averageMinor: elapsedDays === 0 ? 0 : Math.round(spent / elapsedDays),
    emptyDays: elapsed.filter((value) => value === 0).length,
  };
}

/**
 * Degrau de 0 (sem saída) a `HEAT_LEVELS`, proporcional ao maior dia do mês.
 *
 * Quem gastou algo nunca cai em 0, por menor que seja: "teve saída" e "não teve"
 * precisam ser distinguíveis a olho.
 */
export function heatLevel(amountMinor: number, maxMinor: number): number {
  if (amountMinor <= 0 || maxMinor <= 0) return 0;
  return Math.max(1, Math.min(HEAT_LEVELS, Math.ceil((amountMinor / maxMinor) * HEAT_LEVELS)));
}

/**
 * Despesas que compõem o valor de um dia do mapa, na ordem recebida.
 *
 * Reaproveita `filterTransactions` (Fase 1) para o recorte de despesa e aplica
 * `countsInTotals` antes: a lista tem que somar exatamente o número da célula,
 * senão tocar no dia mostraria linhas que o mapa nao contou.
 */
export function expensesOn(items: Transaction[], date: string, state: AppState): Transaction[] {
  const day = items.filter((item) => item.occurredOn === date && countsInTotals(item));
  return filterTransactions(day, { ...NO_FILTERS, kind: "expense" }, state);
}
