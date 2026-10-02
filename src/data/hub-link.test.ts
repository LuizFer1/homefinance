import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALIVE } from "../domain/model/row.fake";
import type { HomeFinanceDb } from "./db";
import {
  clearHubLink,
  HUB_KEYS,
  markAllDirty,
  markRevoked,
  readHubLink,
  resetForEpoch,
  tableSetKey,
  touchLastSync,
  writeHubLink,
} from "./hub-link";
import { openTestDb } from "./test-db.fake";

const CREDENTIALS = {
  address: "192.168.0.5:7777",
  name: "HubFinance",
  key: "a".repeat(64),
  epoch: "01J9ZZZZZZZZZZZZZZZZZZZZZZ",
  deviceName: "Pixel",
};

let db: HomeFinanceDb;

beforeEach(async () => {
  db = openTestDb();
  await db.categories.put({
    ...ALIVE,
    id: "01J9F3K2M7QX8YB4TVWZ0DCEC1",
    name: "Mercado",
    icon: "tag",
    color: "rose",
    kind: "expense",
  });
  await db.users.put({
    ...ALIVE,
    id: "01J9F3K2M7QX8YB4TVWZ0DCEU1",
    name: "Ana",
    color: "teal",
    avatar: null,
  });
});

afterEach(async () => {
  await db.delete();
});

describe("hub-link", () => {
  it("sem as três chaves essenciais não há ligação", async () => {
    expect(await readHubLink(db)).toBeNull();
    await db.meta.put({ key: HUB_KEYS.address, value: "x" });
    expect(await readHubLink(db)).toBeNull();
  });

  it("parear grava as chaves, zera o cursor e marca tudo dirty", async () => {
    await writeHubLink(db, CREDENTIALS);

    expect(await readHubLink(db)).toEqual({
      ...CREDENTIALS,
      cursor: 0,
      tables: tableSetKey(),
      lastSyncAt: null,
      revoked: false,
    });
    expect((await db.categories.toArray()).every((row) => row.dirty === 1)).toBe(true);
    expect((await db.users.toArray()).every((row) => row.dirty === 1)).toBe(true);
  });

  it("parear de novo apaga revogação e último sync", async () => {
    await writeHubLink(db, CREDENTIALS);
    await markRevoked(db);
    await touchLastSync(db, "2026-10-01T18:00:00.000Z");
    expect(await readHubLink(db)).toMatchObject({
      revoked: true,
      lastSyncAt: "2026-10-01T18:00:00.000Z",
    });

    await writeHubLink(db, { ...CREDENTIALS, key: "b".repeat(64) });

    expect(await readHubLink(db)).toMatchObject({
      key: "b".repeat(64),
      revoked: false,
      lastSyncAt: null,
    });
  });

  it("cursor ilegível vale zero", async () => {
    await writeHubLink(db, CREDENTIALS);
    await db.meta.put({ key: HUB_KEYS.cursor, value: "abc" });
    expect((await readHubLink(db))?.cursor).toBe(0);
    await db.meta.put({ key: HUB_KEYS.cursor, value: "42" });
    expect((await readHubLink(db))?.cursor).toBe(42);
  });

  it("resetForEpoch troca a epoch, zera o cursor e marca tudo dirty", async () => {
    await writeHubLink(db, CREDENTIALS);
    await db.meta.put({ key: HUB_KEYS.cursor, value: "42" });
    await db.categories.toCollection().modify({ dirty: 0 });

    await resetForEpoch(db, "01J9YYYYYYYYYYYYYYYYYYYYYY");

    expect(await readHubLink(db)).toMatchObject({ epoch: "01J9YYYYYYYYYYYYYYYYYYYYYY", cursor: 0 });
    expect((await db.categories.toArray()).every((row) => row.dirty === 1)).toBe(true);
  });

  it("markAllDirty só toca linhas limpas", async () => {
    await markAllDirty(db);
    expect((await db.users.toArray()).every((row) => row.dirty === 1)).toBe(true);
  });

  it("desconectar apaga só as chaves do hub", async () => {
    await db.meta.put({ key: "deviceId", value: "D1" });
    await writeHubLink(db, CREDENTIALS);

    await clearHubLink(db);

    expect(await readHubLink(db)).toBeNull();
    expect(await db.meta.get("deviceId")).toEqual({ key: "deviceId", value: "D1" });
    expect(await db.meta.count()).toBe(1);
  });
});
