import type { RecurrenceFrequency, ScheduleType } from "../events/recurrence";
import type { TransactionDraft, TransactionKind } from "../events/transaction";
import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { ProjectionState, RecurrenceRecord, TransactionRecord } from "../projections/apply";
import { eachPeriod, occurrenceKey, occurrenceOn } from "./schedule";

export interface MaterializePlan {
  entityId: Ulid;
  occurrenceKey: string;
  recurrenceId: Ulid;
  draft: TransactionDraft;
}

function asFrequency(value: string): RecurrenceFrequency | null {
  if (
    value === "monthly" ||
    value === "bimonthly" ||
    value === "quarterly" ||
    value === "semiannual" ||
    value === "annual"
  ) {
    return value;
  }
  return null;
}

function asScheduleType(value: string): ScheduleType | null {
  if (value === "dayOfMonth" || value === "nthBusinessDay") return value;
  return null;
}

function asKind(value: string): TransactionKind | null {
  if (value === "income" || value === "expense") return value;
  return null;
}

/**
 * Teto superior da janela de materialização.
 *
 * `endOn` da série corta o futuro da regra; `today` corta o que ainda não
 * aconteceu. O app não grava "próximos 12 meses" no extrato — só o que já venceu.
 */
function untilDate(series: RecurrenceRecord, today: string): string {
  if (series.endOn !== null && series.endOn < today) return series.endOn;
  return today;
}

function alreadyMaterialized(
  transactions: Record<Ulid, TransactionRecord>,
  entityId: Ulid,
): boolean {
  const existing = transactions[entityId];
  return existing?.materialized === true && !existing.deleted;
}

/**
 * Plano puro: quais `transaction.create` faltam para as séries ativas.
 *
 * Sem I/O e sem relógio — `today` entra por parâmetro, como no resto do domínio.
 * A store só emite os eventos; se o plano for vazio, nenhum append.
 */
export function planMaterializations(state: ProjectionState, today: string): MaterializePlan[] {
  const plans: MaterializePlan[] = [];

  for (const series of Object.values(state.recurrences)) {
    if (!series.materialized || series.deleted || !series.active) continue;

    const frequency = asFrequency(series.frequency);
    const scheduleType = asScheduleType(series.scheduleType);
    const kind = asKind(series.kind);
    if (frequency === null || scheduleType === null || kind === null) continue;
    if (series.startOn === "" || series.startOn > today) continue;

    const until = untilDate(series, today);
    const periods = eachPeriod(series.startOn, until, frequency);

    for (const period of periods) {
      const occurredOn = occurrenceOn(period, scheduleType, series.scheduleN);
      // Ainda não chegou o dia desta competência.
      if (occurredOn > today) continue;
      // Série com fim antes desta ocorrência.
      if (series.endOn !== null && occurredOn > series.endOn) continue;

      const key = occurrenceKey(series.id, period);
      const entityId = stableEntityId(key);
      if (alreadyMaterialized(state.transactions, entityId)) continue;

      plans.push({
        entityId,
        occurrenceKey: key,
        recurrenceId: series.id,
        draft: {
          kind,
          description: series.description,
          amountMinor: series.amountMinor,
          currency: "BRL",
          categoryId: series.categoryId,
          paymentMethodId: series.paymentMethodId,
          cashbackMinor: series.cashbackMinor,
          occurredOn,
          recurrenceId: series.id,
          occurrenceKey: key,
        },
      });
    }
  }

  return plans;
}
