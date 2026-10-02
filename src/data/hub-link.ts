import { TABLE_NAMES } from "../domain/model/app-state";
import type { HomeFinanceDb } from "./db";

/**
 * Chaves de `meta` do hub. Locais, nunca sincronizam: a chave é deste aparelho,
 * o cursor é deste aparelho e "pareado" é um fato sobre este aparelho.
 */
export const HUB_KEYS = {
  address: "hubAddress",
  name: "hubName",
  key: "hubKey",
  epoch: "hubEpoch",
  deviceName: "hubDeviceName",
  cursor: "syncCursor",
  tables: "syncTables",
  lastSyncAt: "hubLastSyncAt",
  revoked: "hubRevoked",
} as const;

export interface HubLink {
  /** `host:porta` canônico, ver `normalizeAddress`. */
  address: string;
  name: string;
  /** Chave hex de 64 chars; o hub guarda só o hash. */
  key: string;
  epoch: string;
  deviceName: string;
  /** Último `seq` do hub já gravado aqui; 0 = nunca puxou. */
  cursor: number;
  /** Tabelas que esta versão conhecia no último pull (ver `tableSetKey`). */
  tables: string;
  lastSyncAt: string | null;
  /** O hub respondeu 401: a chave morreu até um novo pareamento. */
  revoked: boolean;
}

export type HubCredentials = Pick<HubLink, "address" | "name" | "key" | "epoch" | "deviceName">;

/**
 * Identidade do conjunto de tabelas desta versão. Se mudou desde o último pull,
 * esta versão ganhou uma tabela que a anterior ignorava sem conhecer, e o pull
 * recomeça do zero para buscar o que ficou para trás no hub.
 */
export function tableSetKey(): string {
  return [...TABLE_NAMES].sort().join(",");
}

function allTables(db: HomeFinanceDb) {
  return TABLE_NAMES.map((table) => db.table(table));
}

/** Sem transação própria: roda dentro da de quem chama. */
async function markDirtyRows(db: HomeFinanceDb): Promise<void> {
  for (const table of TABLE_NAMES) {
    await db.table(table).where("dirty").equals(0).modify({ dirty: 1 });
  }
}

export async function readHubLink(db: HomeFinanceDb): Promise<HubLink | null> {
  const rows = await db.meta.bulkGet(Object.values(HUB_KEYS));
  const meta = new Map<string, string>();
  for (const row of rows) if (row !== undefined) meta.set(row.key, row.value);

  const address = meta.get(HUB_KEYS.address);
  const key = meta.get(HUB_KEYS.key);
  const epoch = meta.get(HUB_KEYS.epoch);
  if (address === undefined || key === undefined || epoch === undefined) return null;

  // Cursor ilegível vale zero: puxar de novo é idempotente; pular linha não é.
  const cursor = Number.parseInt(meta.get(HUB_KEYS.cursor) ?? "0", 10);
  return {
    address,
    key,
    epoch,
    name: meta.get(HUB_KEYS.name) ?? "Hub",
    deviceName: meta.get(HUB_KEYS.deviceName) ?? "",
    cursor: Number.isInteger(cursor) && cursor >= 0 ? cursor : 0,
    tables: meta.get(HUB_KEYS.tables) ?? "",
    lastSyncAt: meta.get(HUB_KEYS.lastSyncAt) ?? null,
    revoked: meta.get(HUB_KEYS.revoked) === "1",
  };
}

/**
 * Toda linha volta a `dirty`: o hub (novo, reinstalado ou que esqueceu este
 * aparelho) não tem nada deste celular até o próximo push.
 */
export async function markAllDirty(db: HomeFinanceDb): Promise<void> {
  await db.transaction("rw", allTables(db), () => markDirtyRows(db));
}

/**
 * Grava a ligação com o hub. Sempre recomeça do zero (cursor 0, tudo `dirty`):
 * uma regra só serve para hub novo, hub reinstalado e re-pareamento depois de
 * revogação — e reenviar o que o hub já tem custa um lote "ignored: same".
 */
export async function writeHubLink(db: HomeFinanceDb, credentials: HubCredentials): Promise<void> {
  await db.transaction("rw", [...allTables(db), db.meta], async () => {
    await db.meta.bulkPut([
      { key: HUB_KEYS.address, value: credentials.address },
      { key: HUB_KEYS.name, value: credentials.name },
      { key: HUB_KEYS.key, value: credentials.key },
      { key: HUB_KEYS.epoch, value: credentials.epoch },
      { key: HUB_KEYS.deviceName, value: credentials.deviceName },
      { key: HUB_KEYS.cursor, value: "0" },
      { key: HUB_KEYS.tables, value: tableSetKey() },
    ]);
    await db.meta.bulkDelete([HUB_KEYS.lastSyncAt, HUB_KEYS.revoked]);
    await markDirtyRows(db);
  });
}

/** Desconectar: só as chaves do hub. `deviceId`, `localUserId` e as linhas ficam. */
export async function clearHubLink(db: HomeFinanceDb): Promise<void> {
  await db.meta.bulkDelete(Object.values(HUB_KEYS));
}

/** `409 epoch_mismatch`: o cursor antigo aponta para outro banco; tudo volta a `dirty`. */
export async function resetForEpoch(db: HomeFinanceDb, epoch: string): Promise<void> {
  await db.transaction("rw", [...allTables(db), db.meta], async () => {
    await db.meta.bulkPut([
      { key: HUB_KEYS.epoch, value: epoch },
      { key: HUB_KEYS.cursor, value: "0" },
    ]);
    await markDirtyRows(db);
  });
}

export async function markRevoked(db: HomeFinanceDb): Promise<void> {
  await db.meta.put({ key: HUB_KEYS.revoked, value: "1" });
}

export async function touchLastSync(db: HomeFinanceDb, iso: string): Promise<void> {
  await db.meta.put({ key: HUB_KEYS.lastSyncAt, value: iso });
}
