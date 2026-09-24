import type { Ulid } from "../ids/ulid";
import type { BaseRow, Draft } from "./base";
import type { TransactionKind } from "./transaction";

/** Só frequências alinhadas a mês civil: extrato e dashboard pensam em mês. */
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

/** A regra. As ocorrências são `Transaction` com `recurrenceId` e `occurrenceKey`. */
export interface Recurrence extends BaseRow {
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
  /** `false` pausa a geração sem apagar o que já foi materializado. */
  active: boolean;
}

export type RecurrenceDraft = Draft<Recurrence>;

/** O que o formulário de lançamento acrescenta para virar série. */
export type RecurrenceRule = Pick<Recurrence, "frequency" | "scheduleType" | "scheduleN" | "endOn">;

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
