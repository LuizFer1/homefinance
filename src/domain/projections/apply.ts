import { compareHlc } from "../clock/hlc";
import type { Transaction } from "../events/transaction";
import { CURRENT_SCHEMA_VERSION, type DomainEvent } from "../events/types";
import type { Ulid } from "../ids/ulid";

export interface TransactionRecord extends Transaction {
  /** Tombstone. Terminal: uma vez verdadeiro, nunca volta a falso. */
  deleted: boolean;
  /** Falso enquanto só chegaram update ou delete órfãos. Invisível na UI. */
  materialized: boolean;
  /** HLC do último evento que tocou cada campo. Vive só na projeção, nunca no log. */
  fieldHlc: Record<string, string>;
}

export interface ProjectionState {
  transactions: Record<Ulid, TransactionRecord>;
  /** Maior HLC já aplicado. É o que decide entre aplicar incremental e refoldar. */
  lastHlc: string | null;
}

export const EMPTY_STATE: ProjectionState = { transactions: {}, lastHlc: null };

const TRANSACTION_FIELDS = [
  "kind",
  "description",
  "amountMinor",
  "currency",
  "categoryId",
  "occurredOn",
] as const;

function isValidFieldValue(field: string, value: unknown): boolean {
  switch (field) {
    case "kind":
      return value === "income" || value === "expense";
    case "description":
      return typeof value === "string";
    case "amountMinor":
      return typeof value === "number" && Number.isInteger(value);
    case "currency":
      return value === "BRL";
    case "categoryId":
      return value === null || typeof value === "string";
    case "occurredOn":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    default:
      return false;
  }
}

function shell(entityId: Ulid): TransactionRecord {
  return {
    id: entityId,
    kind: "expense",
    description: "",
    amountMinor: 0,
    currency: "BRL",
    categoryId: null,
    occurredOn: "",
    deleted: false,
    materialized: false,
    fieldHlc: {},
  };
}

/** LWW por campo: só sobrescreve o campo se este evento for mais novo que o último que o tocou. */
function mergeFields(
  record: TransactionRecord,
  data: Record<string, unknown>,
  hlc: string,
): TransactionRecord {
  const next: TransactionRecord = { ...record, fieldHlc: { ...record.fieldHlc } };

  for (const field of TRANSACTION_FIELDS) {
    if (!(field in data)) continue;

    const value = data[field];
    if (!isValidFieldValue(field, value)) continue;

    const previous = next.fieldHlc[field];
    if (previous !== undefined && previous >= hlc) continue;

    Object.assign(next, { [field]: value });
    next.fieldHlc[field] = hlc;
  }

  return next;
}

export function apply(state: ProjectionState, event: DomainEvent): ProjectionState {
  const lastHlc = state.lastHlc === null || event.hlc > state.lastHlc ? event.hlc : state.lastHlc;
  const unchanged: ProjectionState = { transactions: state.transactions, lastHlc };

  if (event.schemaVersion > CURRENT_SCHEMA_VERSION) return unchanged;
  if (event.entity !== "transaction") return unchanged;

  const current = state.transactions[event.entityId] ?? shell(event.entityId);
  let next: TransactionRecord;

  switch (event.action) {
    case "create":
      next = { ...mergeFields(current, event.data, event.hlc), materialized: true };
      break;
    case "update":
      next = mergeFields(current, event.data, event.hlc);
      break;
    case "delete":
      next = { ...current, deleted: true };
      break;
  }

  return { transactions: { ...state.transactions, [event.entityId]: next }, lastHlc };
}

/** Ordem total por HLC antes de reduzir. É o que torna o fold determinístico. */
export function fold(events: DomainEvent[]): ProjectionState {
  return [...events].sort((a, b) => compareHlc(a.hlc, b.hlc)).reduce(apply, EMPTY_STATE);
}
