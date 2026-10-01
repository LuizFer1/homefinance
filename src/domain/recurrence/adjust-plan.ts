import { shiftMonth } from "../dates/calendar";
import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { Recurrence } from "../model/recurrence";
import type { Transaction } from "../model/transaction";
import { type AdjustmentLike, adjustmentId, adjustmentsOf, amountFor } from "./adjustments";
import { FREQUENCY_MONTHS, occurrenceKey } from "./schedule";

export interface AdjustmentInput {
  recurrenceId: Ulid;
  /** 'YYYY-MM'. */
  fromPeriod: string;
  amountMinor: number;
}

export interface OccurrenceUpdate {
  transaction: Transaction;
  /** Valor que a ocorrência passa a ter. */
  amountMinor: number;
}

export interface AdjustmentPlan {
  adjustmentId: Ulid;
  /** Valor vigente na competência anterior: base do percentual e do "de → para". */
  baseMinor: number;
  /** Ocorrências já lançadas que seguem a série e mudam de valor. */
  updates: OccurrenceUpdate[];
  /** Ocorrências que mudariam, mas foram editadas à mão: ficam como estão. */
  kept: Transaction[];
}

/** 'YYYY-MM' da ocorrência, tirado da chave `${recurrenceId}:${YYYY-MM}`. */
function periodOf(key: string): string {
  return key.slice(key.lastIndexOf(":") + 1);
}

function byDate(a: Transaction, b: Transaction): number {
  return a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0;
}

/**
 * O que reajustar a série a partir de `fromPeriod` faz com o que já existe.
 * Puro: a sheet usa para o resumo antes de confirmar e a store para gravar, e
 * as duas precisam ver exatamente o mesmo plano.
 *
 * Para cada ocorrência viva a partir da competência, compara o valor que a
 * série prevê hoje com o que ela preveria com este reajuste. Se não muda (um
 * reajuste posterior já manda naquele mês), a ocorrência fica fora. Se muda,
 * ela só é atualizada quando ainda tem o valor previsto: a que difere foi
 * editada à mão, e sobrescrevê-la apagaria uma decisão do usuário.
 *
 * Devolve null se a série não existe ou foi apagada.
 */
export function planAdjustment(state: AppState, input: AdjustmentInput): AdjustmentPlan | null {
  const series = state.recurrences[input.recurrenceId];
  if (!isAlive(series)) return null;

  const id = adjustmentId(series.id, input.fromPeriod);
  const current = adjustmentsOf(state, series.id);
  // O reajuste já gravado na mesma competência (mesmo id) é substituído, não
  // somado: no "depois" ele sai e entra o novo.
  const after: AdjustmentLike[] = [
    ...current.filter((row) => row.id !== id),
    {
      recurrenceId: series.id,
      fromPeriod: input.fromPeriod,
      amountMinor: input.amountMinor,
      deletedAt: null,
    },
  ];

  const updates: OccurrenceUpdate[] = [];
  const kept: Transaction[] = [];

  for (const transaction of Object.values(state.transactions)) {
    if (!isAlive(transaction) || transaction.recurrenceId !== series.id) continue;
    if (transaction.occurrenceKey === null) continue;
    const period = periodOf(transaction.occurrenceKey);
    if (period < input.fromPeriod) continue;

    const expected = amountFor(series, current, period);
    const next = amountFor(series, after, period);
    if (next === expected) continue;
    // Já tem o valor novo: não há o que atualizar nem o que avisar como
    // mantido; contá-la como editada faria a sheet anunciar uma exceção falsa.
    if (transaction.amountMinor === next) continue;

    if (transaction.amountMinor === expected) updates.push({ transaction, amountMinor: next });
    else kept.push(transaction);
  }

  updates.sort((a, b) => byDate(a.transaction, b.transaction));
  kept.sort(byDate);

  return {
    adjustmentId: id,
    baseMinor: amountFor(series, current, shiftMonth(input.fromPeriod, -1)),
    updates,
    kept,
  };
}

export interface PeriodChoices {
  /** 'YYYY-MM', em ordem, no passo da frequência. */
  periods: string[];
  initial: string;
}

/** Quantas competências antes e depois da padrão os chips oferecem. */
const BEFORE = 6;
const AFTER = 12;

/**
 * Competências oferecidas para o reajuste.
 *
 * A padrão é a primeira ainda sem linha no banco (nem lançada, nem apagada):
 * o "próximo salário", que é o caso comum. Antes dela ficam até 6 para o
 * reajuste retroativo; depois, até 12. Nunca antes de `startOn` nem depois de
 * `endOn`. Série encerrada e toda lançada só admite retroativo: a padrão vira
 * a última competência.
 */
export function periodChoices(state: AppState, series: Recurrence): PeriodChoices {
  const step = FREQUENCY_MONTHS[series.frequency];
  const lastMonth = series.endOn === null ? null : series.endOn.slice(0, 7);
  const all: string[] = [];
  let initialIndex = -1;
  let cursor = series.startOn.slice(0, 7);

  while (lastMonth === null || cursor <= lastMonth) {
    const exists = state.transactions[stableEntityId(occurrenceKey(series.id, cursor))];
    if (initialIndex === -1 && exists === undefined) initialIndex = all.length;
    all.push(cursor);
    // Sem `endOn` o laço só termina aqui; a padrão sempre aparece, porque o
    // banco tem um número finito de ocorrências.
    if (initialIndex !== -1 && all.length - 1 - initialIndex >= AFTER) break;
    cursor = shiftMonth(cursor, step);
  }

  if (all.length === 0) all.push(series.startOn.slice(0, 7));
  if (initialIndex === -1) initialIndex = all.length - 1;

  return {
    periods: all.slice(Math.max(0, initialIndex - BEFORE), initialIndex + AFTER + 1),
    initial: all[initialIndex] ?? cursor,
  };
}
