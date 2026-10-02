import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { writeHubLink } from "../../data/hub-link";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { ALIVE } from "../../domain/model/row.fake";
import { createFakeHub, type FakeHub } from "../../sync/fake-hub.fake";
import { createSession, type Session } from "../session/session";
import {
  AUTO_SYNC_INTERVAL_MS,
  createSyncStore,
  type SyncStore,
  type SyncStoreDeps,
} from "./store";

const OTHER = "01J9F3K2M7QX8YB4TVWZ0DCEHB";
const ADDRESS = "192.168.0.5:7777";

let db: HomeFinanceDb;
let hub: FakeHub;
let session: Session;
let now: number;
let deps: SyncStoreDeps;

function build(over: Partial<SyncStoreDeps> = {}): SyncStore {
  return createSyncStore({ ...deps, ...over });
}

/** Outro aparelho pareado direto no hub falso, com uma categoria enviada. */
async function otherDevicePushes(): Promise<void> {
  const pair = await hub.fetch(`https://${ADDRESS}/v1/pair`, {
    method: "POST",
    body: JSON.stringify({ token: hub.issueToken(), deviceId: OTHER, name: "B" }),
  });
  const { key } = (await pair.json()) as { key: string };
  await hub.fetch(`https://${ADDRESS}/v1/push`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: JSON.stringify({
      epoch: hub.epoch,
      rows: [
        {
          table: "categories",
          row: {
            ...ALIVE,
            id: "01J9F3K2M7QX8YB4TVWZ0DCEC9",
            updatedAt: `1759344000000-0000-${OTHER}`,
            name: "Da B",
            icon: "tag",
            color: "rose",
            kind: "expense",
          },
        },
      ],
    }),
  });
}

beforeEach(async () => {
  db = openTestDb();
  hub = createFakeHub();
  session = createSession(testSessionDeps(db));
  await session.init();
  now = 1_000_000;
  deps = {
    db,
    session,
    fetch: hub.fetch,
    now: () => now,
    isOnline: () => true,
    onStale: vi.fn(),
  };
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("createSyncStore", () => {
  it("init lê a ligação do disco; sem ligação, sync não faz nada", async () => {
    const store = build();
    await store.init();
    expect(store.link.value).toBeNull();
    expect(await store.sync()).toBeNull();
    expect(hub.calls).toEqual([]);
  });

  it("pair grava a ligação, publica, e já faz a primeira rodada", async () => {
    await otherDevicePushes();
    const store = build();
    await store.init();

    await store.pair({ address: ADDRESS, token: hub.issueToken(), deviceName: "Pixel" });

    expect(store.link.value).toMatchObject({
      address: ADDRESS,
      name: "HubFinance",
      deviceName: "Pixel",
    });
    expect(store.lastSummary.value?.pulled).toBe(1);
    expect(store.lastSyncAt.value).not.toBeNull();
    // O estado em memória viu a linha que o sync gravou direto no banco.
    expect(session.state.value.categories["01J9F3K2M7QX8YB4TVWZ0DCEC9"]?.name).toBe("Da B");
    expect(store.status.value).toBe("idle");
  });

  it("pair com código errado deixa lastError e relança; nada pareado", async () => {
    const store = build();
    await store.init();

    await expect(
      store.pair({ address: ADDRESS, token: "ZZZZZZ", deviceName: "X" }),
    ).rejects.toBeDefined();

    expect(store.lastError.value?.kind).toBe("invalid_token");
    expect(store.link.value).toBeNull();
  });

  it("sync manual relança e guarda o erro; automático engole", async () => {
    const store = build();
    await store.init();
    await store.pair({ address: ADDRESS, token: hub.issueToken(), deviceName: "X" });
    hub.failNext("network");
    await expect(store.sync()).rejects.toMatchObject({ kind: "unreachable" });
    expect(store.lastError.value?.kind).toBe("unreachable");

    now += AUTO_SYNC_INTERVAL_MS;
    hub.failNext("network");
    expect(await store.sync({ auto: true })).toBeNull();
    expect(store.lastError.value?.kind).toBe("unreachable");
  });

  it("automático respeita o intervalo; manual não", async () => {
    const store = build();
    await store.init();
    await store.pair({ address: ADDRESS, token: hub.issueToken(), deviceName: "X" });
    const before = hub.calls.length;

    expect(await store.sync({ auto: true })).toBeNull();
    expect(hub.calls.length).toBe(before);
    expect(await store.sync()).not.toBeNull();
    now += AUTO_SYNC_INTERVAL_MS;
    expect(await store.sync({ auto: true })).not.toBeNull();
  });

  it("duas chamadas em voo compartilham a mesma rodada", async () => {
    const store = build();
    await store.init();
    await store.pair({ address: ADDRESS, token: hub.issueToken(), deviceName: "X" });
    const before = hub.calls.length;

    const [a, b] = await Promise.all([store.sync(), store.sync()]);

    expect(a).toBe(b);
    expect(hub.calls.length).toBe(before + 1);
  });

  it("401 deixa o aparelho revogado e o automático para de tentar", async () => {
    const store = build();
    await store.init();
    await store.pair({ address: ADDRESS, token: hub.issueToken(), deviceName: "X" });
    hub.revoke(session.clock().deviceId);

    await expect(store.sync()).rejects.toMatchObject({ kind: "unauthorized" });

    expect(store.revoked.value).toBe(true);
    expect(store.link.value).not.toBeNull();
    const before = hub.calls.length;
    now += AUTO_SYNC_INTERVAL_MS;
    expect(await store.sync({ auto: true })).toBeNull();
    expect(hub.calls.length).toBe(before);
  });

  it("falha do import(): offline avisa para baixar; online chama onStale", async () => {
    const offline = build({
      load: () => Promise.reject(new Error("chunk")),
      isOnline: () => false,
    });
    await offline.init();
    await expect(
      offline.pair({ address: ADDRESS, token: "ABCDEF", deviceName: "X" }),
    ).rejects.toMatchObject({ offline: true });
    expect(offline.lastError.value?.message).toContain("internet");

    const onStale = vi.fn();
    const stale = build({
      load: () => Promise.reject(new Error("chunk")),
      isOnline: () => true,
      onStale,
    });
    await stale.init();
    await expect(
      stale.pair({ address: ADDRESS, token: "ABCDEF", deviceName: "X" }),
    ).rejects.toMatchObject({ offline: false });
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("afterPull roda só quando chegou linha; reload da sessão roda sempre", async () => {
    const afterPull = vi.fn(async () => {});
    const reload = vi.spyOn(session, "reload");
    const store = build({ afterPull });
    await store.init();
    await store.pair({ address: ADDRESS, token: hub.issueToken(), deviceName: "X" });
    expect(afterPull).not.toHaveBeenCalled();

    await otherDevicePushes();
    await store.sync();

    expect(afterPull).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("unpair apaga a ligação sem precisar do chunk", async () => {
    await writeHubLink(db, {
      address: ADDRESS,
      name: "HubFinance",
      key: "k",
      epoch: hub.epoch,
      deviceName: "X",
    });
    const store = build({ load: () => Promise.reject(new Error("não deveria carregar")) });
    await store.init();
    expect(store.link.value).not.toBeNull();

    await store.unpair();

    expect(store.link.value).toBeNull();
    expect(store.revoked.value).toBe(false);
  });
});
