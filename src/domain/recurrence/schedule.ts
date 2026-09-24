import { dayOfMonthClamped, nthBusinessDayOfMonth } from "../dates/business-day";
import { shiftMonth } from "../dates/calendar";
import type { RecurrenceFrequency, ScheduleType } from "../model/recurrence";

export const FREQUENCY_MONTHS: Record<RecurrenceFrequency, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * Competências (`YYYY-MM`) de `startOn` até o mês de `until`, no passo da
 * frequência, alinhadas ao mês âncora de `startOn`.
 *
 * Bimestral a partir de janeiro: jan, mar, mai… — nunca fev, porque a âncora
 * fixa o residual do módulo.
 */
export function eachPeriod(
  startOn: string,
  until: string,
  frequency: RecurrenceFrequency,
): string[] {
  const startMonth = startOn.slice(0, 7);
  const endMonth = until.slice(0, 7);
  if (startMonth > endMonth) return [];

  const step = FREQUENCY_MONTHS[frequency];
  const periods: string[] = [];
  let cursor = startMonth;

  while (cursor <= endMonth) {
    periods.push(cursor);
    cursor = shiftMonth(cursor, step);
  }

  return periods;
}

/** Data civil da ocorrência na competência, pela regra da série. */
export function occurrenceOn(
  period: string,
  scheduleType: ScheduleType,
  scheduleN: number,
): string {
  return scheduleType === "nthBusinessDay"
    ? nthBusinessDayOfMonth(period, scheduleN)
    : dayOfMonthClamped(period, scheduleN);
}

/**
 * Chave lógica da competência. Duas linhas com a mesma chave e o mesmo
 * `recurrenceId` são a mesma ocorrência — o `entityId` determinístico deriva
 * disto.
 */
export function occurrenceKey(recurrenceId: string, period: string): string {
  return `${recurrenceId}:${period}`;
}
