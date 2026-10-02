import { parseHlc } from "../domain/clock/hlc";
import { TABLE_NAMES, type TableName } from "../domain/model/app-state";
import type { BaseRow } from "../domain/model/base";

/** Tipos do contrato HTTP do hub (`HubFinance/src/protocol/messages.rs`). */

export interface PairRequest {
  token: string;
  deviceId: string;
  name: string;
  /** `meta.localUserId`, para o hub mostrar a pessoa na tela Conexão. */
  userId: string | null;
}

export interface PairResponse {
  deviceId: string;
  key: string;
  epoch: string;
  hubName: string;
}

export interface PushEntry {
  table: string;
  /** O objeto inteiro do IndexedDB, com `dirty`; o hub o descarta. */
  row: BaseRow;
}

export interface PushRequest {
  epoch: string;
  rows: PushEntry[];
}

export interface PushResponse {
  epoch: string;
  accepted: { table: string; id: string; seq: number }[];
  ignored: { table: string; id: string; reason: string }[];
  rejected: { index: number; error: string; message: string }[];
  seq: number;
}

export interface PullQuery {
  epoch: string;
  cursor: number;
  limit: number;
}

export interface PullResponse {
  epoch: string;
  rows: { table: string; seq: number; row: unknown }[];
  cursor: number;
  hasMore: boolean;
}

export interface ErrorBody {
  error: string;
  message: string;
  epoch?: string;
}

/** Metade do teto do hub (1000): folga para linhas com foto de perfil. */
export const PUSH_BATCH = 500;
export const PULL_LIMIT = 500;

/** 26 chars Crockford, não ULID estrito: `stableEntityId` usa o alfabeto inteiro. */
const ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export type RemoteRowCheck =
  | { ok: true; table: TableName; row: BaseRow }
  | { ok: false; reason: "unknown_table" | "invalid_row" };

const INVALID: RemoteRowCheck = { ok: false, reason: "invalid_row" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Guarda de leitura, como `parseHlc` no boot: o hub validou a linha na entrada,
 * mas o que vem pela rede não é mais confiável que o que vem do disco.
 *
 * Tabela que esta versão não conhece não é erro: o outro celular pode rodar um
 * app mais novo. A linha é pulada, o cursor avança, e `syncTables` (ver
 * `hub-link.ts`) faz o pull recomeçar do zero quando esta versão a ganhar.
 */
export function checkRemoteRow(table: unknown, raw: unknown): RemoteRowCheck {
  if (typeof table !== "string" || !(TABLE_NAMES as readonly string[]).includes(table)) {
    return { ok: false, reason: "unknown_table" };
  }
  if (!isRecord(raw)) return INVALID;
  const { id, createdAt, updatedAt, deletedAt } = raw;
  if (typeof id !== "string" || !ID.test(id)) return INVALID;
  if (typeof createdAt !== "string") return INVALID;
  if (typeof updatedAt !== "string" || parseHlc(updatedAt) === null) return INVALID;
  if (deletedAt !== null && (typeof deletedAt !== "string" || parseHlc(deletedAt) === null)) {
    return INVALID;
  }
  // `dirty: 0` sempre: o hub não devolve a coluna, e a linha recebida já é a do hub.
  return { ok: true, table: table as TableName, row: { ...raw, dirty: 0 } as unknown as BaseRow };
}

export function isPairResponse(value: unknown): value is PairResponse {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.key === "string" &&
    typeof value.epoch === "string" &&
    typeof value.hubName === "string"
  );
}

export function isPushResponse(value: unknown): value is PushResponse {
  return (
    isRecord(value) &&
    typeof value.epoch === "string" &&
    Array.isArray(value.accepted) &&
    Array.isArray(value.ignored) &&
    Array.isArray(value.rejected) &&
    typeof value.seq === "number"
  );
}

export function isPullResponse(value: unknown): value is PullResponse {
  return (
    isRecord(value) &&
    typeof value.epoch === "string" &&
    Array.isArray(value.rows) &&
    typeof value.cursor === "number" &&
    typeof value.hasMore === "boolean"
  );
}
