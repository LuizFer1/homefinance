import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import type { TransactionDraft } from "../../domain/model/transaction";
import { createSession, type Session } from "../session/session";
import { createTransactionsStore, type TransactionsStore } from "./store";

const MERCADO: TransactionDraft = {
  kind: "expense",
  description: "Mercado",
  amountMinor: 15_490,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-09-24",
  recurrenceId: null,
  occurrenceKey: null,
};

let db: HomeFinanceDb;
let session: Session;
let store: TransactionsStore;

beforeEach(async () => {
  db = openTestDb();
  session = createSession(testSessionDeps(db));
  await session.init();
  session.localUserId.value = "AUTOR-1";
  store = createTransactionsStore(session);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("createTransactionsStore", () => {
  it("add grava com o autor da sessão", async () => {
    const row = await store.add(MERCADO);
    expect(row).toMatchObject({ ...MERCADO, userId: "AUTOR-1", deletedAt: null });
    expect(await db.transactions.get(row.id)).toEqual(row);
  });

  it("add sem perfil local grava userId nulo", async () => {
    session.localUserId.value = null;
    const row = await store.add(MERCADO);
    expect(row.userId).toBeNull();
    expect((await db.transactions.get(row.id))?.userId).toBeNull();
  });

  it("edit troca os campos e preserva o autor", async () => {
    const created = await store.add(MERCADO);
    session.localUserId.value = "OUTRA-PESSOA";

    const edited = await store.edit(created.id, { ...MERCADO, amountMinor: 20_000 });

    expect(edited.amountMinor).toBe(20_000);
    expect(edited.userId).toBe("AUTOR-1");
    expect(await db.transactions.get(created.id)).toEqual(edited);
  });

  it("edit ignora userId estranho no draft e preserva o autor original", async () => {
    const created = await store.add(MERCADO);

    // `TransactionDraft` não tem `userId`, mas nada impede que uma chamada
    // indevida (bug de UI, cast solto) empurre o campo mesmo assim. O cast
    // simula esse cenário: `edit` precisa continuar imune, porque a proteção
    // de autoria não pode depender só do tipo estático.
    const comAutorEstranho = {
      ...MERCADO,
      amountMinor: 999,
      userId: "INTRUSO",
    } as TransactionDraft;
    const edited = await store.edit(created.id, comAutorEstranho);

    expect(edited.userId).toBe("AUTOR-1");
    expect(edited.amountMinor).toBe(999);
    expect(await db.transactions.get(created.id)).toEqual(edited);
  });

  it("edit zera o cashback", async () => {
    const created = await store.add({ ...MERCADO, cashbackMinor: 300 });
    const edited = await store.edit(created.id, { ...MERCADO, cashbackMinor: null });
    expect(edited.cashbackMinor).toBeNull();
    expect(await db.transactions.get(created.id)).toEqual(edited);
  });

  it("remove marca deletedAt e mantém a linha", async () => {
    const created = await store.add(MERCADO);
    const removed = await store.remove(created.id);
    expect(session.state.value.transactions[created.id]?.deletedAt).not.toBeNull();
    expect(await db.transactions.count()).toBe(1);
    expect(await db.transactions.get(created.id)).toEqual(removed);
  });

  it("falha de escrita rejeita e não publica", async () => {
    vi.spyOn(db.transactions, "put").mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(store.add(MERCADO)).rejects.toThrow("quota exceeded");
    expect(session.state.value.transactions).toEqual({});
  });

  it("edit depois de remove rejeita e não muda estado nem publica erro nulo", async () => {
    const created = await store.add(MERCADO);
    const removed = await store.remove(created.id);

    await expect(store.edit(created.id, { ...MERCADO, amountMinor: 1 })).rejects.toThrow();

    expect(session.state.value.transactions[created.id]).toEqual(removed);
    expect(session.error.value).not.toBeNull();
  });

  it("edit com put rejeitado mantém a linha antiga em memória e no banco", async () => {
    const created = await store.add(MERCADO);
    vi.spyOn(db.transactions, "put").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(store.edit(created.id, { ...MERCADO, amountMinor: 30_000 })).rejects.toThrow(
      "quota exceeded",
    );

    expect(session.state.value.transactions[created.id]).toEqual(created);
    expect(await db.transactions.get(created.id)).toEqual(created);
    expect(session.error.value).toBe("quota exceeded");
  });
});
