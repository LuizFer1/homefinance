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
 */
export function nextMonthFreeMoney(state: AppState, today: string): FreeMoney {
  return recurringMonth(state, shiftMonth(today.slice(0, 7), 1));
}

/**
 * Entradas e saídas recorrentes de um mês 'YYYY-MM' qualquer — futuro, corrente
 * ou passado. É a régua do "Dinheiro livre" e a escala das barras do Resumo: as
 * duas telas têm de chamar de "renda fixa do mês" o mesmo número.
 *
 * Soma duas fontes, sem contar a mesma ocorrência duas vezes: o que a regra
 * ainda vai gerar (`projectRecurrences` já pula a chave que existe no banco) e
 * as ocorrências que já foram gravadas com data no mês — a 1ª parcela de uma
 * compra datada para frente nasce materializada. Ocorrência apagada pelo
 * usuário fica de fora nas duas: a projeção pula a chave e o tombstone não está
 * vivo. Lançamento avulso datado para frente não entra; a pergunta é o que a
 * recorrência já comprometeu.
 *
 * Não recebe `today` de propósito. Em mês passado a projeção só devolve a
 * ocorrência vencida que ainda não tem linha nem tombstone — exatamente a que
 * `planOccurrences` grava no próximo boot, com a mesma chave e o mesmo valor —,
 * então o número não muda quando a materialização roda e nada conta em dobro.
 */
export function recurringMonth(state: AppState, month: string): FreeMoney {
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
