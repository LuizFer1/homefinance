import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrudDb } from "../../data/crud-db";
import { buildRow } from "../../data/repository";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import type { Category } from "../../domain/model/category";
import type { User } from "../../domain/model/user";
import { createCrudSession, LOCAL_USER_ID_KEY } from "./crud-session";

const MERCADO = { name: "Mercado", icon: "utensils", color: "emerald", kind: "expense" } as const;
const LUIZ = { name: "Luiz", color: "teal", avatar: null } as const;

let db: CrudDb;

beforeEach(() => {
  db = openTestDb();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("createCrudSession", () => {
  it("boot cria deviceId e fica pronto com estado vazio", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();

    expect(session.status.value).toBe("ready");
    expect(session.state.value.categories).toEqual({});
    expect((await db.meta.get("deviceId"))?.value).toBe(session.clock().deviceId);
  });

  it("boot carrega as linhas das tabelas e o localUserId", async () => {
    const primeira = createCrudSession(testSessionDeps(db));
    await primeira.init();
    const row = await primeira.mutate("categories", (repo) => repo.create(MERCADO));
    await db.meta.put({ key: LOCAL_USER_ID_KEY, value: "U1" });

    const segunda = createCrudSession(testSessionDeps(db));
    await segunda.init();

    expect(segunda.state.value.categories[row.id]).toEqual(row);
    expect(segunda.localUserId.value).toBe("U1");
  });

  it("mutate grava e publica a linha", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();

    const row = await session.mutate("categories", (repo) => repo.create(MERCADO));

    expect(session.state.value.categories[row.id]).toEqual(row);
    expect(await db.categories.get(row.id)).toEqual(row);
  });

  it("mutate que falha não muda o estado, preenche error e relança", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    vi.spyOn(db.categories, "put").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(session.mutate("categories", (repo) => repo.create(MERCADO))).rejects.toThrow(
      "quota exceeded",
    );
    expect(session.state.value.categories).toEqual({});
    expect(session.error.value).toBe("quota exceeded");
  });

  it("mutate é atômico: op que grava e depois lança não deixa rastro (I2)", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();

    await expect(
      session.mutate("categories", async (repo) => {
        await repo.create(MERCADO);
        throw new Error("falha depois de gravar");
      }),
    ).rejects.toThrow("falha depois de gravar");

    expect(await db.categories.count()).toBe(0);
    expect(session.state.value.categories).toEqual({});
    expect(session.error.value).toBe("falha depois de gravar");
  });

  it("mutate preenche error se clock() lançar (M4)", async () => {
    const session = createCrudSession(testSessionDeps(db));
    // Sem `init()`: `clock()` lança "Sessão não inicializada".

    await expect(session.mutate("categories", (repo) => repo.create(MERCADO))).rejects.toThrow(
      "Sessão não inicializada",
    );
    expect(session.error.value).toBe("Sessão não inicializada");
  });

  it("putRows grava tudo numa transação e publica localUserId", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    const user = buildRow<User>(session.clock(), LUIZ);
    const category = buildRow<Category>(session.clock(), MERCADO);

    await session.putRows(
      { users: [user], categories: [category] },
      { [LOCAL_USER_ID_KEY]: user.id },
    );

    expect(session.state.value.users[user.id]).toEqual(user);
    expect(session.state.value.categories[category.id]).toEqual(category);
    expect(session.localUserId.value).toBe(user.id);
    expect((await db.meta.get(LOCAL_USER_ID_KEY))?.value).toBe(user.id);
  });

  it("putRows que falha no meio não grava nada", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    const user = buildRow<User>(session.clock(), LUIZ);
    const category = buildRow<Category>(session.clock(), MERCADO);
    vi.spyOn(db.categories, "bulkPut").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(
      session.putRows({ users: [user], categories: [category] }, { [LOCAL_USER_ID_KEY]: user.id }),
    ).rejects.toThrow("quota exceeded");

    expect(await db.users.count()).toBe(0);
    expect(await db.meta.get(LOCAL_USER_ID_KEY)).toBeUndefined();
    expect(session.localUserId.value).toBeNull();
    expect(session.state.value.users).toEqual({});
  });

  it("clock antes do init lança", () => {
    const session = createCrudSession(testSessionDeps(db));
    expect(() => session.clock()).toThrow("Sessão não inicializada");
  });

  it("putRows com localUserId undefined não grava meta nem publica (m3)", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    const category = buildRow<Category>(session.clock(), MERCADO);

    await session.putRows({ categories: [category] }, { [LOCAL_USER_ID_KEY]: undefined });

    expect(session.state.value.categories[category.id]).toEqual(category);
    expect(session.localUserId.value).toBeNull();
    expect(await db.meta.get(LOCAL_USER_ID_KEY)).toBeUndefined();
  });

  it("insertMissing não sobrescreve linha existente, nem apagada (I1)", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    const created = await session.mutate("categories", (repo) => repo.create(MERCADO));
    const removed = await session.mutate("categories", (repo) => repo.remove(created.id));

    // Mesmo id, conteúdo diferente: se `insertMissing` sobrescrevesse, a
    // linha voltaria viva com outro nome — exatamente o bug que ele evita.
    const attempt = buildRow<Category>(session.clock(), { ...MERCADO, name: "Outra" }, created.id);
    const inserted = await session.insertMissing("categories", [attempt]);

    expect(inserted).toEqual([]);
    expect(await db.categories.get(created.id)).toEqual(removed);
    expect(session.state.value.categories[created.id]).toEqual(removed);
  });

  it("insertMissing publica no state a linha que já existia no banco (sessão desatualizada) (I1)", async () => {
    const stale = createCrudSession(testSessionDeps(db));
    await stale.init(); // Estado vazio: nasce antes da linha existir.

    const fresh = createCrudSession(testSessionDeps(db));
    await fresh.init();
    const created = await fresh.mutate("categories", (repo) => repo.create(MERCADO));

    expect(stale.state.value.categories[created.id]).toBeUndefined();

    const attempt = buildRow<Category>(stale.clock(), { ...MERCADO, name: "Outra" }, created.id);
    const inserted = await stale.insertMissing("categories", [attempt]);

    expect(inserted).toEqual([]);
    // A sessão desatualizada se atualiza com o que já está no banco, em vez
    // de continuar sem saber da linha.
    expect(stale.state.value.categories[created.id]).toEqual(created);
  });

  it("insertMissing grava as linhas realmente ausentes e as publica", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    const novo = buildRow<Category>(session.clock(), MERCADO);

    const inserted = await session.insertMissing("categories", [novo]);

    expect(inserted).toEqual([novo]);
    expect(await db.categories.get(novo.id)).toEqual(novo);
    expect(session.state.value.categories[novo.id]).toEqual(novo);
  });

  it("insertMissing preenche error e relança se a escrita falhar", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    const novo = buildRow<Category>(session.clock(), MERCADO);
    vi.spyOn(db.categories, "bulkAdd").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(session.insertMissing("categories", [novo])).rejects.toThrow("quota exceeded");
    expect(await db.categories.count()).toBe(0);
    expect(session.state.value.categories).toEqual({});
    expect(session.error.value).toBe("quota exceeded");
  });
});
