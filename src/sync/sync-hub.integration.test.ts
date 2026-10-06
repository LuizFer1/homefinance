import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../data/db";
import { openTestDb } from "../data/test-db.fake";
import { compareHlc } from "../domain/clock/hlc";
import { buildDefaultRows, DEFAULT_CATEGORIES, DEFAULT_METHODS } from "../domain/defaults/defaults";
import type { RandomChunk } from "../domain/ids/ulid";
import { movement, reserve } from "../domain/reserves/fixtures.fake";
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

  it("reservas e movimentos vão de um aparelho ao outro pelo hub", async () => {
    // As tabelas novas não têm caminho próprio no sync: o engine itera
    // `TABLE_NAMES`. Este caso prova que nenhuma lista à mão ficou para trás.
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    const RESERVA = "01J9F3K2M7QX8YB4TVWZ0DCER1";
    const GUARDADO = "01J9F3K2M7QX8YB4TVWZ0DCEM1";

    await a.session.putRows({
      reserves: [
        reserve(RESERVA, {
          name: "Viagem",
          targetMinor: 300_000,
          updatedAt: a.session.clock().stamp().hlc,
          dirty: 1,
        }),
      ],
      reserveMovements: [
        movement(GUARDADO, RESERVA, 50_000, "2026-08-08", {
          updatedAt: a.session.clock().stamp().hlc,
          dirty: 1,
        }),
      ],
    });
    await a.sync.sync();
    await b.sync.sync();

    expect(b.session.state.value.reserves[RESERVA]).toMatchObject({
      name: "Viagem",
      targetMinor: 300_000,
      deletedAt: null,
      dirty: 0,
    });
    expect(b.session.state.value.reserveMovements[GUARDADO]).toMatchObject({
      reserveId: RESERVA,
      amountMinor: 50_000,
      occurredOn: "2026-08-08",
      dirty: 0,
    });
    // O aparelho de origem também fica limpo depois do push.
    expect(a.session.state.value.reserves[RESERVA]?.dirty).toBe(0);
    expect(a.session.state.value.reserveMovements[GUARDADO]?.dirty).toBe(0);
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

describe("categorias e formas padrão", () => {
  const ALIMENTACAO = {
    name: "Alimentação",
    icon: "utensils",
    color: "orange",
    kind: "expense",
  } as const;

  function alive(d: Device) {
    return Object.values(d.session.state.value.categories).filter((c) => c.deletedAt === null);
  }

  it("semeadas em dois aparelhos não se repetem, e a edição vence a semente", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);

    await a.session.putRows(buildDefaultRows());
    const pix = DEFAULT_METHODS[1];
    if (pix === undefined) throw new Error("lista padrão mudou");
    await a.registry.editPaymentMethod(pix.id, { ...pix.draft, name: "Pix Nubank" });
    await a.sync.sync();

    // B semeia depois da edição de A, e mesmo assim a semente perde.
    await b.session.putRows(buildDefaultRows());
    await b.sync.sync();
    await a.sync.sync();

    for (const d of [a, b]) {
      expect(alive(d)).toHaveLength(12);
      expect(Object.values(d.session.state.value.paymentMethods)).toHaveLength(4);
      expect(d.session.state.value.paymentMethods[pix.id]?.name).toBe("Pix Nubank");
    }
  });

  it("cópias antigas de dois aparelhos viram uma só, com os lançamentos apontando para ela", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    const transactions = (d: Device, categoryId: string) =>
      d.session.mutate("transactions", (repo) =>
        repo.create({
          kind: "expense",
          description: "Feira",
          amountMinor: 1000,
          currency: "BRL",
          categoryId,
          paymentMethodId: null,
          cashbackMinor: null,
          occurredOn: "2026-10-01",
          userId: null,
          recurrenceId: null,
          occurrenceKey: null,
        }),
      );

    // Como o primeiro uso gravava antes da correção: id aleatório por aparelho.
    const copiaA = await a.registry.addCategory(ALIMENTACAO);
    const copiaB = await b.registry.addCategory(ALIMENTACAO);
    const txA = await transactions(a, copiaA.id);
    const txB = await transactions(b, copiaB.id);
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();
    expect(alive(a)).toHaveLength(2);

    // O que o boot e o `afterPull` fazem em cada aparelho.
    await a.registry.mergeLegacyDefaults();
    await a.sync.sync();
    await b.sync.sync();
    await b.registry.mergeLegacyDefaults();
    await b.sync.sync();
    await a.sync.sync();

    const food = DEFAULT_CATEGORIES[0]?.id;
    for (const d of [a, b]) {
      expect(alive(d).map((c) => [c.id, c.name])).toEqual([[food, "Alimentação"]]);
      expect(d.session.state.value.transactions[txA.id]?.categoryId).toBe(food);
      expect(d.session.state.value.transactions[txB.id]?.categoryId).toBe(food);
    }

    // Converge e para: nova fusão e novo sync não mexem em nada.
    const seq = hub.maxSeq();
    await a.registry.mergeLegacyDefaults();
    await b.registry.mergeLegacyDefaults();
    await a.sync.sync();
    await b.sync.sync();
    expect(hub.maxSeq()).toBe(seq);
  });
});
