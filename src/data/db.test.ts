import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { HomeFinanceDb } from "./db";

describe("HomeFinanceDb", () => {
  it("upgrade da v1 descarta events e localUserId e mantém deviceId", async () => {
    const name = `homefinance-upgrade-${Date.now()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ events: "id, hlc", meta: "key" });
    await v1.table("events").put({ id: "E1", hlc: "x" });
    await v1.table("meta").bulkPut([
      { key: "deviceId", value: "D1" },
      { key: "localUserId", value: "U1" },
    ]);
    v1.close();

    const db = new HomeFinanceDb(name);
    await db.open();

    // `db.tables` é o cache em memória do Dexie; o que decide se a store
    // ainda existe no IndexedDB é o `backendDB()` — checar direto nele prova
    // que o `events: null` do upgrade realmente removeu a store física.
    expect(Array.from(db.backendDB().objectStoreNames)).not.toContain("events");
    expect(await db.meta.get("deviceId")).toEqual({ key: "deviceId", value: "D1" });
    expect(await db.meta.get("localUserId")).toBeUndefined();
    await db.delete();
  });

  it("banco novo abre com as oito tabelas vazias", async () => {
    const db = new HomeFinanceDb(`homefinance-novo-${Date.now()}`);
    expect(await db.users.count()).toBe(0);
    expect(await db.categories.count()).toBe(0);
    expect(await db.paymentMethods.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.recurrences.count()).toBe(0);
    expect(await db.recurrenceAdjustments.count()).toBe(0);
    expect(await db.reserves.count()).toBe(0);
    expect(await db.reserveMovements.count()).toBe(0);
    await db.delete();
  });

  it("upgrade da v2 cria recurrenceAdjustments e mantém os lançamentos", async () => {
    const name = `homefinance-v2-${Date.now()}`;
    const v2 = new Dexie(name);
    v2.version(2).stores({
      users: "id, dirty",
      categories: "id, dirty",
      paymentMethods: "id, dirty",
      transactions: "id, occurredOn, recurrenceId, dirty",
      recurrences: "id, dirty",
      meta: "key",
    });
    await v2
      .table("transactions")
      .put({ id: "T1", occurredOn: "2026-08-05", recurrenceId: null, dirty: 0 });
    v2.close();

    const db = new HomeFinanceDb(name);
    await db.open();

    expect(await db.transactions.get("T1")).toMatchObject({ id: "T1" });
    expect(await db.recurrenceAdjustments.count()).toBe(0);
    await db.delete();
  });

  it("upgrade da v3 cria as tabelas de reservas e mantém os lançamentos", async () => {
    const name = `homefinance-v3-${Date.now()}`;
    const v3 = new Dexie(name);
    v3.version(3).stores({
      users: "id, dirty",
      categories: "id, dirty",
      paymentMethods: "id, dirty",
      transactions: "id, occurredOn, recurrenceId, dirty",
      recurrences: "id, dirty",
      recurrenceAdjustments: "id, recurrenceId, dirty",
      meta: "key",
    });
    await v3
      .table("transactions")
      .put({ id: "T1", occurredOn: "2026-08-05", recurrenceId: null, dirty: 0 });
    v3.close();

    const db = new HomeFinanceDb(name);
    await db.open();

    expect(await db.transactions.get("T1")).toMatchObject({ id: "T1" });
    expect(await db.reserves.count()).toBe(0);
    expect(await db.reserveMovements.count()).toBe(0);
    await db.delete();
  });
});
