import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent } from "../domain/events/types";
import { HomeFinanceDb } from "./db";
import { createEventStore, type EventStore } from "./event-store";

const DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHR";

function event(millis: number): DomainEvent {
  return {
    id: `evt-${millis}`,
    entity: "transaction",
    entityId: "01J9F3K2M7QX8YB4TVWZ0DCEH2",
    action: "create",
    data: { description: "Mercado" },
    deviceId: DEVICE,
    hlc: `${String(millis).padStart(13, "0")}-0000-${DEVICE}`,
    schemaVersion: 1,
  };
}

let db: HomeFinanceDb;
let store: EventStore;
let dbName: string;
let counter = 0;

beforeEach(() => {
  counter += 1;
  dbName = `homefinance-test-${counter}`;
  db = new HomeFinanceDb(dbName);
  store = createEventStore(db);
});

afterEach(async () => {
  await db.delete();
});

describe("EventStore", () => {
  it("grava e devolve eventos ordenados por HLC", async () => {
    await store.append(event(1_754_697_600_020));
    await store.append(event(1_754_697_600_010));

    const all = await store.readAll();

    expect(all.map((item) => item.hlc)).toEqual([
      `1754697600010-0000-${DEVICE}`,
      `1754697600020-0000-${DEVICE}`,
    ]);
  });

  it("é idempotente por id", async () => {
    await store.append(event(1_754_697_600_010));
    await store.append(event(1_754_697_600_010));

    expect(await store.readAll()).toHaveLength(1);
  });

  it("sobrescreve quando o mesmo id chega com conteúdo diferente", async () => {
    const original = event(1_754_697_600_010);
    const impostor: DomainEvent = { ...original, data: { description: "Outro" } };

    await store.append(original);
    await store.append(impostor);
    const all = await store.readAll();

    // Comportamento declarado, não desejado: `put` não distingue. A unicidade do
    // `id` é garantida em `domain/ids/ulid.ts`, não aqui.
    expect(all).toHaveLength(1);
    expect(all[0]?.data).toEqual({ description: "Outro" });
  });

  it("devolve lista vazia num banco novo", async () => {
    expect(await store.readAll()).toEqual([]);
  });

  it("guarda e lê metadados", async () => {
    expect(await store.getMeta("deviceId")).toBeNull();

    await store.setMeta("deviceId", DEVICE);

    expect(await store.getMeta("deviceId")).toBe(DEVICE);
  });

  it("sobrevive a reabrir o banco", async () => {
    await store.append(event(1_754_697_600_010));
    await store.setMeta("deviceId", DEVICE);
    db.close();

    const reaberto = new HomeFinanceDb(dbName);
    const storeReaberta = createEventStore(reaberto);

    expect(await storeReaberta.readAll()).toHaveLength(1);
    expect(await storeReaberta.getMeta("deviceId")).toBe(DEVICE);
    reaberto.close();
  });
});
