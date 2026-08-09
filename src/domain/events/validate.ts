import { parseHlc } from "../clock/hlc";
import type { Action, DomainEvent, EntityKind } from "./types";

const ENTITIES: readonly string[] = [
  "user",
  "category",
  "transaction",
  "investment",
  "reserve",
] satisfies readonly EntityKind[];

const ACTIONS: readonly string[] = ["create", "update", "delete"] satisfies readonly Action[];

function isFilledString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * Guarda de integridade na fronteira de leitura do log. Não valida o conteúdo de
 * `data` — isso é responsabilidade do fold, campo a campo, porque o formato de
 * `data` muda com `schemaVersion` e o envelope não.
 */
export function isValidEvent(value: unknown): value is DomainEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const event = value as Record<string, unknown>;

  return (
    isFilledString(event.id) &&
    isFilledString(event.entityId) &&
    isFilledString(event.deviceId) &&
    typeof event.entity === "string" &&
    ENTITIES.includes(event.entity) &&
    typeof event.action === "string" &&
    ACTIONS.includes(event.action) &&
    typeof event.data === "object" &&
    event.data !== null &&
    !Array.isArray(event.data) &&
    isFilledString(event.hlc) &&
    parseHlc(event.hlc) !== null &&
    typeof event.schemaVersion === "number" &&
    Number.isInteger(event.schemaVersion)
  );
}
