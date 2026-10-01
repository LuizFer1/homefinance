import type { Ulid } from "../ids/ulid";
import type { BaseRow, Draft } from "./base";

/**
 * Valor novo de uma série a partir de uma competência. A série guarda o
 * valor-base e nunca é reescrita: o valor vigente num mês é o do reajuste mais
 * recente até ele (ver `amountFor`).
 *
 * Linha própria, e não array dentro de `Recurrence`: com LWW por linha, dois
 * reajustes feitos offline em aparelhos diferentes na mesma série perderiam um
 * deles em silêncio se morassem na mesma linha.
 */
export interface RecurrenceAdjustment extends BaseRow {
  recurrenceId: Ulid;
  /** 'YYYY-MM': primeira competência com o valor novo. */
  fromPeriod: string;
  /** Valor novo já calculado. O percentual digitado é só forma de entrada. */
  amountMinor: number;
}

export type RecurrenceAdjustmentDraft = Draft<RecurrenceAdjustment>;
