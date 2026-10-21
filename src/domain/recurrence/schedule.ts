import { dayOfMonthClamped, nthBusinessDayOfMonth } from "../dates/business-day";
import { shiftDay, shiftMonth } from "../dates/calendar";
import type {
  DayStepFrequency,
  MonthStepFrequency,
  RecurrenceFrequency,
  ScheduleType,
} from "../model/recurrence";

export const FREQUENCY_DAYS: Record<DayStepFrequency, number> = {
  weekly: 7,
  biweekly: 14,
};

export const FREQUENCY_MONTHS: Record<MonthStepFrequency, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export function isDayStep(frequency: string): frequency is DayStepFrequency {
  return Object.hasOwn(FREQUENCY_DAYS, frequency);
}

export function isKnownFrequency(frequency: string): frequency is RecurrenceFrequency {
  return isDayStep(frequency) || Object.hasOwn(FREQUENCY_MONTHS, frequency);
}

/**
 * Competência imediatamente anterior a `period` (o dia ou o mês antes): dela
 * sai o valor-base de um reajuste. Não é um passo da série: um passo inteiro
 * para trás passaria do valor vigente logo antes.
 */
export function previousPeriod(period: string): string {
  return period.length === 10 ? shiftDay(period, -1) : shiftMonth(period, -1);
}

/**
 * Competência que contém `date` no ritmo da série: a própria data (`YYYY-MM-DD`)
 * para semanal/quinzenal, `YYYY-MM` para as demais. A chave da ocorrência semanal
 * não pode ser o mês, senão duas ocorrências do mesmo mês colidiriam no id.
 */
export function periodOf(frequency: RecurrenceFrequency, date: string): string {
  return isDayStep(frequency) ? date : date.slice(0, 7);
}

/** Competência seguinte (ou anterior, com delta negativo) no ritmo da série. */
export function stepPeriod(frequency: RecurrenceFrequency, period: string, times = 1): string {
  return isDayStep(frequency)
    ? shiftDay(period, FREQUENCY_DAYS[frequency] * times)
    : shiftMonth(period, FREQUENCY_MONTHS[frequency] * times);
}

/**
 * Competências de `startOn` até `until`, no passo da frequência, alinhadas à
 * âncora de `startOn`: datas (`YYYY-MM-DD`) para semanal/quinzenal, `YYYY-MM`
 * para as demais.
 *
 * Bimestral a partir de janeiro: jan, mar, mai… — nunca fev, porque a âncora
 * fixa o residual do módulo.
 *
 * Frequência desconhecida (valor de versão futura chegando por sync) não gera
 * nada: a série fica parada em vez de travar o boot.
 */
export function eachPeriod(
  startOn: string,
  until: string,
  frequency: RecurrenceFrequency,
): string[] {
  const periods: string[] = [];

  if (isDayStep(frequency)) {
    // 7 e 14 dias não dependem do calendário, então andar de data em data não
    // deriva como derivaria o dia do mês.
    for (let cursor = startOn; cursor <= until; cursor = stepPeriod(frequency, cursor)) {
      periods.push(cursor);
    }
    return periods;
  }

  if (!Object.hasOwn(FREQUENCY_MONTHS, frequency)) return periods;

  const endMonth = until.slice(0, 7);
  let cursor = startOn.slice(0, 7);
  while (cursor <= endMonth) {
    periods.push(cursor);
    cursor = stepPeriod(frequency, cursor);
  }

  return periods;
}

/**
 * Data civil da ocorrência na competência, pela regra da série. Competência
 * já em forma de data (semanal/quinzenal) é a própria ocorrência: dia útil e
 * dia do mês não se aplicam.
 */
export function occurrenceOn(
  period: string,
  scheduleType: ScheduleType,
  scheduleN: number,
): string {
  if (period.length === 10) return period;
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

/** Competência da ocorrência (`YYYY-MM`, ou `YYYY-MM-DD` se semanal/quinzenal), tirada da chave. */
export function periodOfKey(key: string): string {
  return key.slice(key.lastIndexOf(":") + 1);
}
