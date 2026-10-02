import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../data/db";
import { openTestDb } from "../data/test-db.fake";
import { compareHlc } from "../domain/clock/hlc";
import type { RandomChunk } from "../domain/ids/ulid";
import { createRegistryStore, type RegistryStore } from "../features/registry/store";
import { createSession, type Session } from "../features/session/session";
import { createSyncStore, type SyncStore } from "../features/sync/store";
import { createFakeHub, type FakeHub } from "./fake-hub.fake";

const ADDRESS = "192.168.0.5:7777";
const MERCADO = { name: "Mercado", icon: "utensils", color: "emerald", kind: "expense" } as const;

interface Device {
  db: HomeFinanceDb;
  session: Session;
  registry: RegistryStore;
  sync: SyncStore;
}

let abertos: HomeFinanceDb[] = [];

/**
 * Cada aparelho tem o próprio relógio, deslocado: `testSessionDeps` começa
 * sempre no mesmo instante e os dois nasceriam com o mesmo `deviceId`.
 */
function depsFor(db: HomeFinanceDb, offsetMs: number) {
  let millis = 1_754_697_600_000 + offsetMs;
  const randomChunk: RandomChunk = (count) => Array.from({ length: count }, (_, i) => i % 32);
  return {
    db,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk,
  };
}

async function device(hub: FakeHub, name: string, offsetMs: number): Promise<Device> {
  const db = openTestDb();
  abertos.push(db);
  const deps = depsFor(db, offsetMs);
  const session = createSession(deps);
  await session.init();
  const sync = createSyncStore({
    db,
    session,
    fetch: hub.fetch,
    now: deps.now,
    isOnline: () => true,
    onStale: () => {},
  });
  await sync.init();
  await sync.pair({ address: ADDRESS, token: hub.issueToken(), deviceName: name });
  return { db, session, registry: createRegistryStore(session), sync };
}

function categories(d: Device) {
  return Object.values(d.session.state.value.categories)
    .map(({ id, name, deletedAt, dirty }) => ({ id, name, deleted: deletedAt !== null, dirty }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

afterEach(async () => {
  await Promise.all(abertos.map((db) => db.delete()));
  abertos = [];
});

describe("dois aparelhos, um hub", () => {
  it("criar, editar, apagar e reviver convergem; sync repetido não muda nada", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);

    const cat = await a.registry.addCategory(MERCADO);
    await a.sync.sync();
    await b.sync.sync();
    expect(categories(b)).toEqual([{ id: cat.id, name: "Mercado", deleted: false, dirty: 0 }]);

    await b.registry.editCategory(cat.id, { ...MERCADO, name: "Feira" });
    await b.sync.sync();
    await a.sync.sync();
    expect(categories(a)).toEqual([{ id: cat.id, name: "Feira", deleted: false, dirty: 0 }]);

    await a.registry.removeCategory(cat.id);
    await a.sync.sync();
    await b.sync.sync();
    expect(categories(b)[0]?.deleted).toBe(true);

    // Reviver: a linha volta com `deletedAt: null` e `updatedAt` maior.
    const dead = b.session.state.value.categories[cat.id];
    if (dead === undefined) throw new Error("linha sumiu");
    await b.session.putRows({
      categories: [
        { ...dead, deletedAt: null, updatedAt: b.session.clock().stamp().hlc, dirty: 1 },
      ],
    });
    await b.sync.sync();
    await a.sync.sync();
    expect(categories(a)[0]?.deleted).toBe(false);

    const seqBefore = hub.maxSeq();
    const stateA = categories(a);
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();
    expect(hub.maxSeq()).toBe(seqBefore);
    expect(categories(a)).toEqual(stateA);
    expect(categories(b)).toEqual(stateA);
  });

  it("edição concorrente: vence o updatedAt maior nos dois aparelhos", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    const cat = await a.registry.addCategory(MERCADO);
    await a.sync.sync();
    await b.sync.sync();

    // Os dois editam offline; o relógio de B anda 60 s à frente.
    const fromA = await a.registry.editCategory(cat.id, { ...MERCADO, name: "De A" });
    const fromB = await b.registry.editCategory(cat.id, { ...MERCADO, name: "De B" });
    expect(compareHlc(fromB.updatedAt, fromA.updatedAt)).toBeGreaterThan(0);

    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();

    expect(categories(a)[0]?.name).toBe("De B");
    expect(categories(b)[0]?.name).toBe("De B");
    expect(categories(a)[0]?.dirty).toBe(0);
  });

  it("hub recriado com os mesmos aparelhos (409): tudo é reenviado e converge", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    await a.registry.addCategory(MERCADO);
    await b.registry.addCategory({ ...MERCADO, name: "Transporte" });
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();

    hub.recreate(true);
    expect(hub.rows()).toEqual([]);

    const first = await a.sync.sync();
    expect(first?.epochReset).toBe(true);
    expect(hub.rows().length).toBeGreaterThanOrEqual(2);
    await b.sync.sync();
    await a.sync.sync();

    expect(
      categories(a)
        .map((c) => c.name)
        .sort(),
    ).toEqual(["Mercado", "Transporte"]);
    expect(categories(b)).toEqual(categories(a));
    expect(a.sync.link.value?.epoch).toBe(hub.epoch);
  });

  it("revogado: fica desconectado e volta a sincronizar ao parear de novo", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    hub.revoke(b.session.clock().deviceId);

    await expect(b.sync.sync()).rejects.toMatchObject({ kind: "unauthorized" });
    expect(b.sync.revoked.value).toBe(true);

    await a.registry.addCategory(MERCADO);
    await a.sync.sync();
    await b.sync.pair({ address: ADDRESS, token: hub.issueToken(), deviceName: "B de novo" });

    expect(b.sync.revoked.value).toBe(false);
    expect(categories(b).map((c) => c.name)).toEqual(["Mercado"]);
  });
});
