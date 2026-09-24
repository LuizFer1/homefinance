import { shiftDay } from "../dates/calendar";
import type { RecurrenceFrequency, ScheduleType } from "../events/recurrence";
import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { ProjectionState } from "../projections/apply";
import { eachPeriod, FREQUENCY_MONTHS, occurrenceKey, occurrenceOn } from "./schedule";

export interface UpcomingOccurrence {
  recurrenceId: Ulid;
  /** 'YYYY-MM-DD'. */
  date: string;
  kind: string;
  description: string;
  amountMinor: number;
  categoryId: Ulid | null;
}

function isFrequency(value: string): value is RecurrenceFrequency {
  return Object.hasOwn(FREQUENCY_MONTHS, value);
}

function isScheduleType(value: string): value is ScheduleType {
  return value === "dayOfMonth" || value === "nthBusinessDay";
}

/**
 * "Recorrentes a caminho": ocorrências de séries ativas depois de hoje e até
 * `days` dias à frente.
 *
 * Calculado, nunca gravado. A materialização só escreve o que já venceu — o
 * extrato não mente sobre o futuro —, então o que está por vir é projetado da
 * regra na hora de desenhar. Ocorrência que já existe no log (materializada ou
 * apagada pelo usuário) fica de fora pela mesma chave determinística.
 */
export function upcomingRecurrences(
  state: ProjectionState,
  today: string,
  days: number,
): UpcomingOccurrence[] {
  const limit = shiftDay(today, days);
  const found: UpcomingOccurrence[] = [];

  for (const series of Object.values(state.recurrences)) {
    if (!series.materialized || series.deleted || !series.active) continue;
    if (!isFrequency(series.frequency) || !isScheduleType(series.scheduleType)) continue;
    if (series.startOn === "") continue;

    for (const period of eachPeriod(series.startOn, limit, series.frequency)) {
      const date = occurrenceOn(period, series.scheduleType, series.scheduleN);
      if (date <= today || date > limit) continue;
      if (series.endOn !== null && date > series.endOn) continue;
      if (state.transactions[stableEntityId(occurrenceKey(series.id, period))] !== undefined) {
        continue;
      }

      found.push({
        recurrenceId: series.id,
        date,
        kind: series.kind,
        description: series.description,
        amountMinor: series.amountMinor,
        categoryId: series.categoryId,
      });
    }
  }

  return found.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface RuleDraft {
  startOn: string;
  frequency: RecurrenceFrequency;
  scheduleType: ScheduleType;
  scheduleN: number;
  endOn?: string | null;
}

/**
 * "Próximas vezes" do assistente: as `count` ocorrências **depois** da primeira
 * (a primeira é o próprio lançamento que está sendo criado).
 *
 * Mesma aritmética da materialização — `eachPeriod` + `occurrenceOn` —, então o
 * que a tela promete é exatamente o que o app vai gravar.
 */
export function nextOccurrences(rule: RuleDraft, count: number): string[] {
  const step = FREQUENCY_MONTHS[rule.frequency];
  // Horizonte folgado: `count + 1` passos cobrem a primeira mais as pedidas.
  const horizon = `${Number(rule.startOn.slice(0, 4)) + Math.ceil(((count + 1) * step) / 12) + 1}-12-31`;

  return eachPeriod(rule.startOn, horizon, rule.frequency)
    .slice(1, count + 1)
    .map((period) => occurrenceOn(period, rule.scheduleType, rule.scheduleN))
    .filter((date) => rule.endOn == null || date <= rule.endOn);
}
