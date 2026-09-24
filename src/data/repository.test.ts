import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareHlc } from "../domain/clock/hlc";
import { createRowClock, type RowClock } from "../domain/clock/row-clock";
import type { Category } from "../domain/model/category";
import type { HomeFinanceDb } from "./db";
import { buildRow, createRepository, type Repository } from "./repository";
import { openTestDb, TEST_DEVICE_ID, testSessionDeps } from "./test-db.fake";

const MERCADO = { name: "Mercado", icon: "utensils", color: "emerald", kind: "expense" } as const;

let db: HomeFinanceDb;
let clock: RowClock;
let repo: Repository<Category>;

beforeEach(() => {
  db = openTestDb();
  const deps = testSessionDeps(db);
  clock = createRowClock({
    deviceId: TEST_DEVICE_ID,
    now: deps.now,
    randomChunk: deps.randomChunk,
  });
  repo = createRepository(db.categories, clock);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("createRepository", () => {
  it("create grava a linha com timestamps, deletedAt nulo e dirty", async () => {
    const row = await repo.create(MERCADO);

    expect(row).toMatchObject({ ...MERCADO, deletedAt: null, dirty: 1 });
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await db.categories.get(row.id)).toEqual(row);
  });

  it("create respeita o id recebido", async () => {
    const row = await repo.create(MERCADO, "ID-FIXO");
    expect(row.id).toBe("ID-FIXO");
  });

  it("update grava a linha inteira com updatedAt novo", async () => {
    const created = await repo.create(MERCADO);
    await db.categories.update(created.id, { dirty: 0 });

    const updated = await repo.update(created.id, { ...MERCADO, color: "red" });

    expect(updated.color).toBe("red");
    expect(updated.name).toBe("Mercado");
    expect(updated.dirty).toBe(1);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(compareHlc(updated.updatedAt, created.updatedAt)).toBe(1);
    expect(await db.categories.get(created.id)).toEqual(updated);
  });

  it("update sem mudança não escreve", async () => {
    const created = await repo.create(MERCADO);
    const same = await repo.update(created.id, { ...MERCADO });
    expect(same).toEqual(created);
  });

  it("update de id inexistente rejeita", async () => {
    await expect(repo.update("NAO-EXISTE", { name: "x" })).rejects.toThrow();
  });

  it("update de linha apagada rejeita", async () => {
    const created = await repo.create(MERCADO);
    await repo.remove(created.id);
    await expect(repo.update(created.id, { name: "x" })).rejects.toThrow();
  });

  it("update ignora colunas de BaseRow no changes (I1, cenário 1)", async () => {
    const a = await repo.create(MERCADO);
    const b = await repo.create({ ...MERCADO, name: "Farmácia" });

    // `changes` inclui a linha B inteira (id, createdAt, updatedAt, deletedAt,
    // dirty de B) — nenhuma dessas colunas pode vazar para a linha A.
    const updated = await repo.update(a.id, { ...b, name: "X" });

    expect(updated.id).toBe(a.id);
    expect(updated.createdAt).toBe(a.createdAt);
    expect(updated.name).toBe("X");
    expect(await db.categories.get(b.id)).toEqual(b);
  });

  it("update descarta entradas undefined no changes (I1, cenário 2)", async () => {
    const created = await repo.create({ ...MERCADO, name: "Original" });

    const updated = await repo.update(created.id, { name: undefined, color: "red" } as never);

    expect(updated.name).toBe("Original");
    expect(updated.color).toBe("red");
    expect(await db.categories.get(created.id)).toEqual(updated);
  });

  it("remove marca deletedAt e mantém a linha", async () => {
    const created = await repo.create(MERCADO);
    const removed = await repo.remove(created.id);

    expect(removed.deletedAt).toBe(removed.updatedAt);
    expect(removed.dirty).toBe(1);
    expect(await db.categories.get(created.id)).toEqual(removed);
  });

  it("remove é idempotente", async () => {
    const created = await repo.create(MERCADO);
    const first = await repo.remove(created.id);
    const second = await repo.remove(created.id);
    expect(second).toEqual(first);
  });

  it("remove de id inexistente rejeita", async () => {
    await expect(repo.remove("NAO-EXISTE")).rejects.toThrow();
  });

  it("updates concorrentes na mesma linha não se perdem (I3)", async () => {
    const created = await repo.create(MERCADO);

    const [a, b] = await Promise.all([
      repo.update(created.id, { name: "Novo" }),
      repo.update(created.id, { color: "red" }),
    ]);

    const final = await db.categories.get(created.id);
    expect(final?.name).toBe("Novo");
    expect(final?.color).toBe("red");
    // As duas resoluções apontam para a mesma linha final gravada.
    expect(a.id).toBe(created.id);
    expect(b.id).toBe(created.id);
  });

  it("listAll devolve vivas e apagadas", async () => {
    const a = await repo.create(MERCADO);
    await repo.create({ ...MERCADO, name: "Farmácia" });
    await repo.remove(a.id);
    expect(await repo.listAll()).toHaveLength(2);
  });

  it("buildRow monta a linha sem gravar", async () => {
    const row = buildRow<Category>(clock, MERCADO);
    expect(row).toMatchObject({ ...MERCADO, deletedAt: null, dirty: 1 });
    expect(await db.categories.count()).toBe(0);
  });
});
