import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeFinanceDb } from "../data/db";
import { HUB_KEYS, readHubLink, writeHubLink } from "../data/hub-link";
import { openTestDb } from "../data/test-db.fake";
import type { Category } from "../domain/model/category";
import { ALIVE } from "../domain/model/row.fake";
import { runSync, type SyncEngineDeps } from "./engine";
import { createFakeHub, type FakeHub } from "./fake-hub.fake";
import { createHubTransport, SyncError } from "./transport";

const ADDRESS = "192.168.0.5:7777";
const ME = "01J9F3K2M7QX8YB4TVWZ0DCEHA";
const OTHER = "01J9F3K2M7QX8YB4TVWZ0DCEHB";

function hlc(millis: number, device = ME): string {
  return `${String(millis).padStart(13, "0")}-0000-${device}`;
}

function category(n: number, over: Partial<Category> = {}): Category {
  return {
    ...ALIVE,
    id: `01J9F3K2M7QX8YB4TVWZ0DCE${String(n).padStart(2, "0")}`,
    updatedAt: hlc(1_759_344_000_000 + n),
    name: `Cat ${n}`,
    icon: "tag",
    color: "rose",
    kind: "expense",
    dirty: 1,
    ...over,
  };
}

let db: HomeFinanceDb;
let hub: FakeHub;
let observed: string[];
let deps: SyncEngineDeps;

/** Pareia `deviceId` direto no hub falso e grava a ligação no banco. */
async function pairedWith(deviceId: string, target: HomeFinanceDb): Promise<string> {
  const response = await hub.fetch(`https://${ADDRESS}/v1/pair`, {
    method: "POST",
    body: JSON.stringify({ token: hub.issueToken(), deviceId, name: deviceId.slice(-2) }),
  });
  const { key } = (await response.json()) as { key: string };
  await writeHubLink(target, {
    address: ADDRESS,
    name: "HubFinance",
    key,
    epoch: hub.epoch,
    deviceName: "T",
  });
  return key;
}

/** Push direto de outro aparelho, para o pull ter o que trazer. */
async function otherPushes(key: string, rows: Category[]) {
  await hub.fetch(`https://${ADDRESS}/v1/push`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: JSON.stringify({
      epoch: hub.epoch,
      rows: rows.map((row) => ({ table: "categories", row })),
    }),
  });
}

beforeEach(async () => {
  db = openTestDb();
  hub = createFakeHub();
  observed = [];
  await pairedWith(ME, db);
  deps = {
    db,
    transport: createHubTransport({ fetch: hub.fetch }),
    deviceId: ME,
    observe: (value) => observed.push(value),
    now: () => 1_759_344_999_999,
  };
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("runSync — push", () => {
  it("envia as linhas dirty em lotes e limpa o dirty das aceitas e das ignoradas", async () => {
    await db.categories.bulkPut([category(1), category(2), category(3)]);
    await db.users.put({
      ...ALIVE,
      id: "01J9F3K2M7QX8YB4TVWZ0DCEV1",
      name: "Ana",
      color: "teal",
      avatar: null,
      dirty: 1,
    });
    // Já conhecida pelo hub com o mesmo updatedAt: volta como "same".
    const otherKey = await pairedWith(OTHER, openTestDb());
    await otherPushes(otherKey, [category(3)]);

    const before = hub.calls.length;

    const summary = await runSync({ ...deps, pushBatch: 2 });

    expect(summary).toMatchObject({ pushed: 3, ignored: 1, rejected: [], epochReset: false });
    const pushes = hub.calls.slice(before).filter((call) => call.path === "/v1/push");
    expect(pushes.map((call) => (call.body as { rows: unknown[] }).rows.length)).toEqual([2, 2]);
    expect((await db.categories.toArray()).every((row) => row.dirty === 0)).toBe(true);
    expect((await db.users.toArray()).every((row) => row.dirty === 0)).toBe(true);
    expect(hub.rows().map((row) => row.row.dirty)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("não limpa o dirty de linha editada durante o envio", async () => {
    await db.categories.put(category(1));
    const original = deps.transport.push;
    deps.transport = {
      ...deps.transport,
      // Entre o envio e a resposta, a linha muda no banco (outra aba, outro toque).
      push: async (address, key, body) => {
        const response = await original(address, key, body);
        await db.categories.put(
          category(1, { name: "Editada", updatedAt: hlc(1_759_344_000_999) }),
        );
        return response;
      },
    };

    await runSync(deps);

    expect(await db.categories.get(category(1).id)).toMatchObject({ name: "Editada", dirty: 1 });
  });

  it("linha recusada pelo hub continua dirty e aparece no resumo", async () => {
    await db.categories.put(category(1, { updatedAt: "quebrado" }));

    const summary = await runSync(deps);

    expect(summary.rejected).toEqual([
      {
        table: "categories",
        id: category(1).id,
        error: "invalid_updated_at",
        message: expect.any(String),
      },
    ]);
    expect((await db.categories.get(category(1).id))?.dirty).toBe(1);
  });

  it("sem linha dirty não chama o push", async () => {
    const before = hub.calls.length;
    await runSync(deps);
    expect(hub.calls.slice(before).map((call) => call.method + call.path.split("?")[0])).toEqual([
      "GET/v1/pull",
    ]);
  });
});

describe("runSync — pull", () => {
  let otherKey: string;

  beforeEach(async () => {
    otherKey = await pairedWith(OTHER, openTestDb());
  });

  it("grava as linhas do outro aparelho com dirty 0, pagina e persiste o cursor por página", async () => {
    await otherPushes(otherKey, [category(1), category(2), category(3)]);
    const pulls: string[] = [];
    const original = deps.transport.pull;
    deps.transport = {
      ...deps.transport,
      pull: async (address, key, query) => {
        const response = await original(address, key, query);
        pulls.push(`${query.cursor}:${(await db.meta.get(HUB_KEYS.cursor))?.value ?? "-"}`);
        return response;
      },
    };

    const summary = await runSync({ ...deps, pullLimit: 2 });

    expect(summary.pulled).toBe(3);
    expect((await db.categories.toArray()).map((row) => row.dirty)).toEqual([0, 0, 0]);
    // Segunda página pedida já com o cursor da primeira gravado.
    expect(pulls).toEqual(["0:0", "2:2"]);
    expect((await readHubLink(db))?.cursor).toBe(3);
  });

  it("LWW estrito: só grava a remota estritamente mais nova", async () => {
    const same = category(1, { dirty: 0 });
    const olderLocal = category(2, { name: "Local velha", updatedAt: hlc(1), dirty: 0 });
    // `dirty: 0`: com 1, o push (que vem antes) a mandaria ao hub e o pull nem a
    // traria de volta — o teste não exercitaria o LWW do pull.
    const newerLocal = category(3, {
      name: "Local nova",
      updatedAt: hlc(9_999_999_999_999),
      dirty: 0,
    });
    await db.categories.bulkPut([same, olderLocal, newerLocal]);
    await otherPushes(otherKey, [
      category(1, { name: "Remota igual" }),
      category(2, { name: "Remota nova" }),
      category(3, { name: "Remota velha" }),
    ]);
    await db.meta.put({ key: HUB_KEYS.cursor, value: "0" });

    const summary = await runSync(deps);

    expect(summary.pulled).toBe(1);
    expect((await db.categories.get(same.id))?.name).toBe("Cat 1");
    expect(await db.categories.get(olderLocal.id)).toMatchObject({ name: "Remota nova", dirty: 0 });
    expect(await db.categories.get(newerLocal.id)).toMatchObject({ name: "Local nova", dirty: 0 });
  });

  it("o relógio observa cada linha válida antes de gravar", async () => {
    const remote = category(1, { deletedAt: hlc(1_759_344_000_500, OTHER) });
    await otherPushes(otherKey, [remote]);
    const seenAtObserve: Promise<unknown>[] = [];
    deps.observe = (value) => {
      observed.push(value);
      // A leitura sai na hora do `observe`: o IndexedDB a ordena antes da
      // transação que grava a página, então ela vê o banco de antes.
      seenAtObserve.push(db.categories.get(remote.id));
    };

    await runSync(deps);

    expect(observed).toEqual([remote.updatedAt, remote.deletedAt]);
    expect(await Promise.all(seenAtObserve)).toEqual([undefined, undefined]);
    expect(await db.categories.get(remote.id)).toMatchObject({ name: remote.name });
  });

  it("tabela desconhecida é contada e o cursor avança; linha inválida também", async () => {
    await hub.fetch(`https://${ADDRESS}/v1/push`, {
      method: "POST",
      headers: { authorization: `Bearer ${otherKey}` },
      body: JSON.stringify({
        epoch: hub.epoch,
        rows: [
          { table: "investments", row: category(1) },
          { table: "categories", row: { ...category(2), createdAt: 42 } },
          { table: "categories", row: category(3) },
        ],
      }),
    });

    const summary = await runSync(deps);

    expect(summary).toMatchObject({
      pulled: 1,
      invalid: 1,
      unknownTables: ["investments"],
    });
    expect((await readHubLink(db))?.cursor).toBe(3);
  });

  it("conjunto de tabelas diferente do último pull recomeça do cursor 0", async () => {
    await otherPushes(otherKey, [category(1)]);
    await db.meta.bulkPut([
      { key: HUB_KEYS.cursor, value: "1" },
      { key: HUB_KEYS.tables, value: "categories,users" },
    ]);

    const summary = await runSync(deps);

    expect(summary.pulled).toBe(1);
    expect(hub.calls.at(-1)?.path).toContain("cursor=0");
  });

  it("falha na segunda página mantém a primeira gravada com o cursor dela", async () => {
    await otherPushes(otherKey, [category(1), category(2), category(3)]);
    let pulls = 0;
    const original = deps.transport.pull;
    deps.transport = {
      ...deps.transport,
      pull: (address, key, query) => {
        pulls += 1;
        if (pulls === 2) hub.failNext("network");
        return original(address, key, query);
      },
    };

    await expect(runSync({ ...deps, pullLimit: 2 })).rejects.toMatchObject({ kind: "unreachable" });

    expect(await db.categories.count()).toBe(2);
    expect((await readHubLink(db))?.cursor).toBe(2);
    expect((await readHubLink(db))?.lastSyncAt).toBeNull();
  });

  it("ligação trocada no meio da rodada: a página velha não entra nem grava cursor", async () => {
    await otherPushes(otherKey, [category(1)]);
    const original = deps.transport.pull;
    deps.transport = {
      ...deps.transport,
      pull: async (address, key, query) => {
        const response = await original(address, key, query);
        // Outra aba pareou com outro hub enquanto a resposta vinha.
        await db.meta.bulkPut([
          { key: HUB_KEYS.key, value: "f".repeat(64) },
          { key: HUB_KEYS.cursor, value: "0" },
        ]);
        return response;
      },
    };

    await expect(runSync(deps)).rejects.toThrow("mudou");

    expect(await db.categories.count()).toBe(0);
    expect((await db.meta.get(HUB_KEYS.cursor))?.value).toBe("0");
  });

  it("ligação trocada durante o push: o dirty fica para o hub novo", async () => {
    await db.categories.put(category(1));
    const original = deps.transport.push;
    deps.transport = {
      ...deps.transport,
      push: async (address, key, body) => {
        const response = await original(address, key, body);
        await db.meta.put({ key: HUB_KEYS.key, value: "f".repeat(64) });
        return response;
      },
    };

    await expect(runSync(deps)).rejects.toThrow("mudou");

    expect((await db.categories.get(category(1).id))?.dirty).toBe(1);
  });

  it("entrada de rows que não é objeto é erro de protocolo, não TypeError", async () => {
    deps.transport = {
      ...deps.transport,
      pull: async () => ({ epoch: hub.epoch, rows: [null as never], cursor: 1, hasMore: false }),
    };
    await expect(runSync(deps)).rejects.toMatchObject({ name: "SyncError", kind: "protocol" });
    expect((await readHubLink(db))?.cursor).toBe(0);
  });

  it("cursor que não avança com hasMore é erro de protocolo, não laço", async () => {
    deps.transport = {
      ...deps.transport,
      pull: async () => ({ epoch: hub.epoch, rows: [], cursor: 0, hasMore: true }),
    };
    await expect(runSync(deps)).rejects.toMatchObject({ kind: "protocol" });
  });
});

describe("runSync — epoch e revogação", () => {
  it("409 zera o cursor, marca tudo dirty, repete uma vez e converge", async () => {
    await db.categories.bulkPut([category(1, { dirty: 0 }), category(2, { dirty: 1 })]);
    await db.meta.put({ key: HUB_KEYS.cursor, value: "7" });
    hub.recreate(true);
    const before = hub.calls.length;

    const summary = await runSync(deps);

    expect(summary).toMatchObject({ pushed: 2, epochReset: true });
    // A repetição puxa do zero no banco novo, não do cursor 7 do antigo.
    const pulls = hub.calls.slice(before).filter((call) => call.path.startsWith("/v1/pull"));
    expect(pulls.at(-1)?.path).toBe(`/v1/pull?epoch=${hub.epoch}&cursor=0&limit=500`);
    expect(await readHubLink(db)).toMatchObject({ epoch: hub.epoch, cursor: 2, revoked: false });
    expect((await db.categories.toArray()).every((row) => row.dirty === 0)).toBe(true);
  });

  it("409 duas vezes na mesma rodada é erro, não laço", async () => {
    let pulls = 0;
    deps.transport = {
      ...deps.transport,
      pull: async () => {
        pulls += 1;
        throw new SyncError("epoch_mismatch", "x", { epoch: `01J9ZZZZZZZZZZZZZZZZZZZZZ${pulls}` });
      },
    };

    await expect(runSync(deps)).rejects.toMatchObject({ kind: "epoch_mismatch" });

    expect(pulls).toBe(2);
    expect((await readHubLink(db))?.epoch).toBe("01J9ZZZZZZZZZZZZZZZZZZZZZ1");
  });

  it("401 marca o aparelho como revogado e relança", async () => {
    hub.revoke(ME);

    await expect(runSync(deps)).rejects.toMatchObject({ kind: "unauthorized" });

    expect((await readHubLink(db))?.revoked).toBe(true);
  });

  it("rodada completa grava hubLastSyncAt com o relógio injetado", async () => {
    await runSync(deps);
    expect((await readHubLink(db))?.lastSyncAt).toBe(new Date(1_759_344_999_999).toISOString());
  });

  it("sem ligação gravada não há o que sincronizar", async () => {
    const empty = openTestDb();
    await expect(runSync({ ...deps, db: empty })).rejects.toThrow("não está pareado");
    await empty.delete();
  });
});
