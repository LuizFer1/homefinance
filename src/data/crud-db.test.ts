import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { CrudDb } from "./crud-db";

describe("CrudDb", () => {
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

    const db = new CrudDb(name);
    await db.open();

    // `db.tables` é o cache em memória do Dexie; o que decide se a store
    // ainda existe no IndexedDB é o `backendDB()` — checar direto nele prova
    // que o `events: null` do upgrade realmente removeu a store física.
    expect(Array.from(db.backendDB().objectStoreNames)).not.toContain("events");
    expect(await db.meta.get("deviceId")).toEqual({ key: "deviceId", value: "D1" });
    expect(await db.meta.get("localUserId")).toBeUndefined();
    await db.delete();
  });

  it("banco novo abre com as cinco tabelas vazias", async () => {
    const db = new CrudDb(`homefinance-novo-${Date.now()}`);
    expect(await db.users.count()).toBe(0);
    expect(await db.categories.count()).toBe(0);
    expect(await db.paymentMethods.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.recurrences.count()).toBe(0);
    await db.delete();
  });
});
