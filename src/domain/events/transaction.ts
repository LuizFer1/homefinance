import type { Ulid } from "../ids/ulid";
import { CURRENT_SCHEMA_VERSION, type DomainEvent } from "./types";

export type TransactionKind = "income" | "expense";

export interface Transaction {
  id: Ulid;
  kind: TransactionKind;
  description: string;
  /** Inteiro na unidade menor: 1234 é R$ 12,34. Nunca float, nunca string. */
  amountMinor: number;
  currency: "BRL";
  categoryId: Ulid | null;
  /** Data do fato, escolhida pelo usuário. Não confundir com o HLC. */
  occurredOn: string;
}

export type TransactionDraft = Omit<Transaction, "id">;
export type TransactionPatch = Partial<Omit<Transaction, "id" | "currency">>;

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
    entity: "transaction",
    entityId: envelope.entityId,
    action,
    data,
    deviceId: envelope.deviceId,
    hlc: envelope.hlc,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export function transactionCreated(args: Envelope & { draft: TransactionDraft }): DomainEvent {
  return envelopeToEvent(args, "create", { ...args.draft });
}

export function transactionUpdated(args: Envelope & { patch: TransactionPatch }): DomainEvent {
  return envelopeToEvent(args, "update", { ...args.patch });
}

export function transactionDeleted(args: Envelope): DomainEvent {
  return envelopeToEvent(args, "delete", {});
}

/**
 * Campos alterados entre o registro atual e o que o formulário devolveu.
 * Emitir o agregado inteiro num `update` transformaria o patch parcial num
 * documento disfarçado e faria o LWW por campo perder edições concorrentes
 * sem nenhum sintoma visível.
 */
export function diffTransaction(current: Transaction, next: TransactionDraft): TransactionPatch {
  const patch: TransactionPatch = {};
  if (current.kind !== next.kind) patch.kind = next.kind;
  if (current.description !== next.description) patch.description = next.description;
  if (current.amountMinor !== next.amountMinor) patch.amountMinor = next.amountMinor;
  if (current.categoryId !== next.categoryId) patch.categoryId = next.categoryId;
  if (current.occurredOn !== next.occurredOn) patch.occurredOn = next.occurredOn;
  return patch;
}
