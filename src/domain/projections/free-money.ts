import { lastDayOfMonth } from "../dates/business-day";
import { shiftMonth } from "../dates/calendar";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import { projectRecurrences } from "../recurrence/upcoming";
import { countsInTotals } from "../transactions/counts-in-totals";

export interface FreeMoney {
  /** 'YYYY-MM' do mês projetado. */
  month: string;
  /** Entradas recorrentes previstas no mês. */
  incomeMinor: number;
  /** Saídas recorrentes previstas no mês: o dinheiro já comprometido. */
  expenseMinor: number;
  /** `incomeMinor - expenseMinor`; negativo quando as saídas passam das entradas. */
  freeMinor: number;
  /** Alguma parcela do número vem de série variável ou de lançamento estimado. */
  estimated: boolean;
}

/**
 * "Dinheiro livre mês que vem": entradas recorrentes menos saídas recorrentes
 * do mês seguinte a `today`.
 *
 * Soma duas fontes, sem contar a mesma ocorrência duas vezes: o que a regra
 * ainda vai gerar (`projectRecurrences` já pula a chave que existe no banco) e
 * as ocorrências que já foram gravadas com data no mês — a 1ª parcela de uma
 * compra datada para frente nasce materializada. Ocorrência apagada pelo
 * usuário fica de fora nas duas: a projeção pula a chave e o tombstone não está
 * vivo. Lançamento avulso datado para frente não entra; a pergunta é o que a
 * recorrência já comprometeu.
 */
export function nextMonthFreeMoney(state: AppState, today: string): FreeMoney {
  const month = shiftMonth(today.slice(0, 7), 1);
  let incomeMinor = 0;
  let expenseMinor = 0;
  let estimated = false;

  const add = (kind: string, amountMinor: number, isEstimate: boolean) => {
    if (kind === "income") incomeMinor += amountMinor;
    else expenseMinor += amountMinor;
    if (isEstimate) estimated = true;
  };

  const before = lastDayOfMonth(shiftMonth(month, -1));
  for (const item of projectRecurrences(state, before, lastDayOfMonth(month))) {
    add(item.kind, item.amountMinor, item.estimated);
  }

  for (const row of Object.values(state.transactions)) {
    if (!isAlive(row) || row.recurrenceId === null) continue;
    if (row.occurredOn.slice(0, 7) !== month || !countsInTotals(row)) continue;
    add(row.kind, row.amountMinor, row.estimated === true);
  }

  return { month, incomeMinor, expenseMinor, freeMinor: incomeMinor - expenseMinor, estimated };
}
