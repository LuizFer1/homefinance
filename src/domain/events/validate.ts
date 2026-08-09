import { parseHlc } from "../clock/hlc";
import type { Action, DomainEvent, EntityKind } from "./types";

/**
 * Mapas, e não arrays com `satisfies`, porque `Record<EntityKind, true>` quebra a
 * compilação se `EntityKind` ganhar um variante e alguém esquecer de listá-lo aqui.
 * Com array, o membro faltante passa em silêncio — e o efeito seria rejeitar todo
 * evento daquele tipo, ou seja, perda silenciosa de dado do usuário.
 */
const ENTITIES: Record<EntityKind, true> = {
  user: true,
  category: true,
  transaction: true,
  investment: true,
  reserve: true,
};

const ACTIONS: Record<Action, true> = {
  create: true,
  update: true,
  delete: true,
};

function isFilledString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * Objeto simples — não `Date`, `Map`, array nem instância de classe.
 * Dexie persiste por structured clone, que preserva esses tipos ao contrário de JSON,
 * então `typeof x === "object"` deixaria passar lixo que vira lançamento fantasma.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Guarda de integridade na fronteira de leitura do log. Não valida o conteúdo de
 * `data` — isso é responsabilidade do fold, campo a campo, porque o formato de
 * `data` muda com `schemaVersion` e o envelope não.
 */
export function isValidEvent(value: unknown): value is DomainEvent {
  if (!isPlainObject(value)) return false;

  return (
    isFilledString(value.id) &&
    isFilledString(value.entityId) &&
    isFilledString(value.deviceId) &&
    isFilledString(value.entity) &&
    Object.hasOwn(ENTITIES, value.entity) &&
    isFilledString(value.action) &&
    Object.hasOwn(ACTIONS, value.action) &&
    isPlainObject(value.data) &&
    isFilledString(value.hlc) &&
    parseHlc(value.hlc) !== null &&
    typeof value.schemaVersion === "number" &&
    Number.isInteger(value.schemaVersion)
  );
}
