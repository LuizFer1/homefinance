import type { Ulid } from "../ids/ulid";
import type { TransactionKind } from "./transaction";
import { CURRENT_SCHEMA_VERSION, type DomainEvent } from "./types";

/**
 * Passo entre competências, em meses.
 *
 * Só frequências alinhadas a mês civil: o extrato e o dashboard já pensam em
 * mês, e "toda semana" exigiria outro eixo de chave de ocorrência.
 */
export const RECURRENCE_FREQUENCIES = [
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const SCHEDULE_TYPES = ["dayOfMonth", "nthBusinessDay"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

/**
 * Série recorrente: a regra. As ocorrências são `transaction` materializadas
 * com `recurrenceId` + `occurrenceKey` — ver spec 2026-08-11-recorrencia.
 */
export interface Recurrence {
  id: Ulid;
  kind: TransactionKind;
  description: string;
  amountMinor: number;
  currency: "BRL";
  categoryId: Ulid | null;
  paymentMethodId: Ulid | null;
  cashbackMinor: number | null;
  frequency: RecurrenceFrequency;
  scheduleType: ScheduleType;
  /** Dia do mês (1–31) ou N-ésimo dia útil (1–23). */
  scheduleN: number;
  startOn: string;
  endOn: string | null;
  /** `false` pausa a geração sem apagar o histórico materializado. */
  active: boolean;
}

export type RecurrenceDraft = Omit<Recurrence, "id">;
export type RecurrencePatch = Partial<RecurrenceDraft>;

export interface RecurrenceLike {
  kind: string;
  description: string;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  cashbackMinor: number | null;
  frequency: string;
  scheduleType: string;
  scheduleN: number;
  startOn: string;
  endOn: string | null;
  active: boolean;
}

interface Envelope {
  eventId: Ulid;
  entityId: Ulid;
  deviceId: Ulid;
  hlc: string;
}

function envelopeToEvent(
  envelope: Envelope,
  action: DomainEvent["action"],
  data: Record<string, unknown>,
): DomainEvent {
  return {
    id: envelope.eventId,
    entity: "recurrence",
    entityId: envelope.entityId,
    action,
    data,
    deviceId: envelope.deviceId,
    hlc: envelope.hlc,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export function recurrenceCreated(args: Envelope & { draft: RecurrenceDraft }): DomainEvent {
  return envelopeToEvent(args, "create", { ...args.draft });
}

export function recurrenceUpdated(args: Envelope & { patch: RecurrencePatch }): DomainEvent {
  return envelopeToEvent(args, "update", { ...args.patch });
}

export function recurrenceDeleted(args: Envelope): DomainEvent {
  return envelopeToEvent(args, "delete", {});
}

export function diffRecurrence(current: RecurrenceLike, next: RecurrenceDraft): RecurrencePatch {
  const patch: RecurrencePatch = {};
  if (current.kind !== next.kind) patch.kind = next.kind;
  if (current.description !== next.description) patch.description = next.description;
  if (current.amountMinor !== next.amountMinor) patch.amountMinor = next.amountMinor;
  if (current.categoryId !== next.categoryId) patch.categoryId = next.categoryId;
  if (current.paymentMethodId !== next.paymentMethodId) {
    patch.paymentMethodId = next.paymentMethodId;
  }
  if (current.cashbackMinor !== next.cashbackMinor) patch.cashbackMinor = next.cashbackMinor;
  if (current.frequency !== next.frequency) patch.frequency = next.frequency;
  if (current.scheduleType !== next.scheduleType) patch.scheduleType = next.scheduleType;
  if (current.scheduleN !== next.scheduleN) patch.scheduleN = next.scheduleN;
  if (current.startOn !== next.startOn) patch.startOn = next.startOn;
  if (current.endOn !== next.endOn) patch.endOn = next.endOn;
  if (current.active !== next.active) patch.active = next.active;
  return patch;
}

/** Rótulos de UI — moram perto do tipo para não divergir do select. */
export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  dayOfMonth: "Dia fixo do mês",
  nthBusinessDay: "Dia útil do mês",
};
