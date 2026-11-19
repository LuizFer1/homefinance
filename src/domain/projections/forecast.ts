import { lastDayOfMonth } from "../dates/business-day";
import { shiftMonth } from "../dates/calendar";
import type { AppState } from "../model/app-state";
import type { Transaction } from "../model/transaction";
import { projectRecurrences } from "../recurrence/upcoming";
import { countsInTotals } from "../transactions/counts-in-totals";
import { filterByMonth } from "./breakdown";
import { daysInMonth } from "./insights";
import { monthOf } from "./periods";
import { totals } from "./selectors";

/**
 * Previsão de fechamento do mês corrente, "fechar no zero" e taxa de poupança
 * (spec do dashboard do hub 5.6; indicadores §6.1 e §6.2). O hub faz a mesma conta
 * em `insights.rs` sobre a mesma fixture: qualquer mudança aqui tem par lá, senão o
 * celular e o PC prometem fins de mês diferentes.
 */

/** Até este dia a média diária é instável demais: a previsão não aparece, fica o ritmo. */
export const FORECAST_HIDDEN_THROUGH_DAY = 5;

/** Alvo da taxa de poupança, em porcentagem da renda. */
export const SAVINGS_TARGET_PERCENT = 20;

export interface Forecast {
  /** 'YYYY-MM' de hoje: só existe previsão do mês corrente. */
  month: string;
  /** Dia de hoje (1..n). */
  day: number;
  daysInMonth: number;
  /** Dias depois de hoje até o fim do mês. */
  remainingDays: number;
  /**
   * Lançado no mês **inteiro**, como os totais do card: um lançamento datado para
   * frente dentro do mês já é conhecido e conta.
   */
  incomeMinor: number;
  expenseMinor: number;
  /** Despesa avulsa (sem série) de hoje para trás: a base da média. */
  casualMinor: number;
  /** "Sua média até aqui": `casualMinor ÷ day`, arredondado. */
  casualDailyMinor: number;
  /** Ocorrências recorrentes ainda sem linha no mês, vencidas ou por vir. */
  upcomingIncomeMinor: number;
  upcomingExpenseMinor: number;
  /** A média avulsa vezes os dias que faltam. */
  projectedCasualMinor: number;
  expectedIncomeMinor: number;
  expectedExpenseMinor: number;
  /** Negativo = vai faltar. */
  expectedSurplusMinor: number;
  /** Taxa de poupança no ritmo atual; `null` sem receita prevista. */
  expectedSavingsRate: number | null;
}

/**
 * Taxa de poupança em porcentagem inteira: `(receita − despesa) ÷ receita`. Guardar
 * em reserva não abate (não é despesa: é parte do que sobrou). Sem receita, `null`
 * — não há "% da renda" de renda nenhuma. A forma `a ÷ b × 100` dentro do
 * `Math.round` é a mesma do `js_round` do hub, para o ponto flutuante dar igual.
 */
export function savingsRate(incomeMinor: number, expenseMinor: number): number | null {
  if (incomeMinor <= 0) return null;
  return Math.round(((incomeMinor - expenseMinor) / incomeMinor) * 100);
}

/**
 * Valor de previsão para a tela ("~R$ 960"): o módulo arredondado à dezena de reais,
 * com o sinal de volta. Centavo numa previsão é falsa precisão. Arredondar o módulo
 * (e não o valor com sinal) deixa −R$ 5 e +R$ 5 simétricos.
 */
export function roundToTens(minor: number): number {
  const rounded = Math.round(Math.abs(minor) / 1_000) * 1_000;
  return minor < 0 && rounded !== 0 ? -rounded : rounded;
}

/**
 * Se o mês continuar no ritmo de hoje, como ele fecha.
 *
 * `sobra = receita lançada + receitas recorrentes por vir − despesa lançada −
 * despesas recorrentes por vir − média avulsa × dias restantes`.
 *
 * A média é só do **avulso**: a recorrência "valor varia" (luz, feira) já entra
 * pela estimativa dela na projeção, e somá-la também na média contaria duas vezes.
 * E só do que já aconteceu (`occurredOn <= today`): um avulso datado para frente
 * conta na despesa lançada, mas não puxa a média. A projeção vai do último dia do
 * mês anterior ao fim deste, então a ocorrência vencida que o aparelho ainda não
 * gravou entra uma vez, pelo valor que a materialização vai gravar.
 *
 * `null` fora do mês corrente não existe aqui (o mês sai de `today`); `null` até o
 * dia 5.
 */
export function forecast(items: Transaction[], state: AppState, today: string): Forecast | null {
  const month = monthOf(today);
  const day = Number(today.slice(8, 10));
  if (day <= FORECAST_HIDDEN_THROUGH_DAY) return null;

  const days = daysInMonth(month);
  const remainingDays = days - day;
  const monthItems = filterByMonth(items, month);
  const launched = totals(monthItems);

  let casualMinor = 0;
  for (const item of monthItems) {
    if (item.kind !== "expense" || item.recurrenceId !== null || !countsInTotals(item)) continue;
    if (item.occurredOn <= today) casualMinor += item.amountMinor;
  }

  let upcomingIncomeMinor = 0;
  let upcomingExpenseMinor = 0;
  const before = lastDayOfMonth(shiftMonth(month, -1));
  for (const item of projectRecurrences(state, before, lastDayOfMonth(month))) {
    if (item.kind === "income") upcomingIncomeMinor += item.amountMinor;
    else upcomingExpenseMinor += item.amountMinor;
  }

  // Multiplica antes de dividir: arredondar a média e depois multiplicar erraria
  // em centavos (11776 × 11 = 129536, contra 129534 do hub).
  const projectedCasualMinor = Math.round((casualMinor * remainingDays) / day);
  const expectedIncomeMinor = launched.incomeMinor + upcomingIncomeMinor;
  const expectedExpenseMinor = launched.expenseMinor + upcomingExpenseMinor + projectedCasualMinor;

  return {
    month,
    day,
    daysInMonth: days,
    remainingDays,
    incomeMinor: launched.incomeMinor,
    expenseMinor: launched.expenseMinor,
    casualMinor,
    casualDailyMinor: Math.round(casualMinor / day),
    upcomingIncomeMinor,
    upcomingExpenseMinor,
    projectedCasualMinor,
    expectedIncomeMinor,
    expectedExpenseMinor,
    expectedSurplusMinor: expectedIncomeMinor - expectedExpenseMinor,
    expectedSavingsRate: savingsRate(expectedIncomeMinor, expectedExpenseMinor),
  };
}

/**
 * "Para fechar no zero": quanto dá para gastar por dia até o fim do mês sem a sobra
 * ficar negativa, contando só o que já se sabe (lançado + recorrentes por vir).
 *
 * Piso em reais inteiros, nunca arredondado: é um teto de gasto, e superestimá-lo
 * em um real por dia faria a pessoa fechar no vermelho seguindo o conselho. Uma
 * divisão só (por `dias × 100`), para o ponto flutuante bater com o hub. `null` no
 * último dia (não há dia para dividir); zero ou menos quer dizer que as contas que
 * ainda vêm já passam do saldo, e a tela troca o texto.
 */
export function zeroAllowance(f: Forecast): number | null {
  if (f.remainingDays <= 0) return null;
  const available = f.incomeMinor - f.expenseMinor + f.upcomingIncomeMinor - f.upcomingExpenseMinor;
  return Math.floor(available / (f.remainingDays * 100)) * 100;
}
