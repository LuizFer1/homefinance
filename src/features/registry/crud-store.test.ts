import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrudDb } from "../../data/crud-db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { compareHlc } from "../../domain/clock/hlc";
import { type CrudSession, createCrudSession } from "../session/crud-session";
import { createRegistryStore, type RegistryStore } from "./crud-store";

const MERCADO = { name: "Mercado", icon: "utensils", color: "emerald", kind: "expense" } as const;
const NUBANK = { name: "Nubank", icon: "credit-card", color: "violet", kind: "credit" } as const;

let db: CrudDb;
let session: CrudSession;
let store: RegistryStore;

beforeEach(async () => {
  db = openTestDb();
  session = createCrudSession(testSessionDeps(db));
  await session.init();
  store = createRegistryStore(session);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("createRegistryStore (CRUD)", () => {
  it("addCategory grava e publica", async () => {
    const row = await store.addCategory(MERCADO);
    expect(session.state.value.categories[row.id]).toMatchObject(MERCADO);
    expect(await db.categories.get(row.id)).toEqual(row);
  });

  it("editCategory recebe o draft completo e troca a linha", async () => {
    const created = await store.addCategory(MERCADO);
    const edited = await store.editCategory(created.id, { ...MERCADO, name: "Supermercado" });

    expect(edited.name).toBe("Supermercado");
    expect(compareHlc(edited.updatedAt, created.updatedAt)).toBe(1);
    expect(session.state.value.categories[created.id]?.name).toBe("Supermercado");
    expect(await db.categories.get(created.id)).toEqual(edited);
  });

  it("editCategory sem mudança não avança updatedAt", async () => {
    const created = await store.addCategory(MERCADO);
    const same = await store.editCategory(created.id, { ...MERCADO });
    expect(same.updatedAt).toBe(created.updatedAt);
    expect(await db.categories.get(created.id)).toEqual(created);
  });

  it("removeCategory marca deletedAt e mantém a linha", async () => {
    const created = await store.addCategory(MERCADO);
    await store.removeCategory(created.id);

    expect(session.state.value.categories[created.id]?.deletedAt).not.toBeNull();
    expect((await db.categories.get(created.id))?.deletedAt).not.toBeNull();
    expect(await db.categories.count()).toBe(1);
  });

  it("forma de pagamento: add, edit e remove", async () => {
    const created = await store.addPaymentMethod(NUBANK);
    await store.editPaymentMethod(created.id, { ...NUBANK, kind: "debit" });
    expect(session.state.value.paymentMethods[created.id]?.kind).toBe("debit");
    expect((await db.paymentMethods.get(created.id))?.kind).toBe("debit");

    await store.removePaymentMethod(created.id);
    expect(session.state.value.paymentMethods[created.id]?.deletedAt).not.toBeNull();
    expect((await db.paymentMethods.get(created.id))?.deletedAt).not.toBeNull();
  });

  it("falha de escrita rejeita e não publica", async () => {
    vi.spyOn(db.categories, "put").mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(store.addCategory(MERCADO)).rejects.toThrow("quota exceeded");
    expect(session.state.value.categories).toEqual({});
  });

  it("falha de escrita no edit rejeita e mantém a linha antiga", async () => {
    const created = await store.addCategory(MERCADO);
    vi.spyOn(db.categories, "put").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(
      store.editCategory(created.id, { ...MERCADO, name: "Supermercado" }),
    ).rejects.toThrow("quota exceeded");

    expect(session.state.value.categories[created.id]).toEqual(created);
    expect(await db.categories.get(created.id)).toEqual(created);
    expect(session.error.value).toBe("quota exceeded");
  });
});
