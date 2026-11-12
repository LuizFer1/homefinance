import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { defaultId } from "../../domain/defaults/defaults";
import { bookOf } from "../../domain/model/book";
import { BUSINESS_BOOK_ID } from "../../domain/model/book-account";
import { COLOR_TOKENS } from "../../domain/model/tokens";
import { ICON_KEYS } from "../icons/icon-set";
import { ACTIVE_BOOK_KEY, createSession, type Session } from "../session/session";
import { type BooksStore, createBooksStore } from "./store";

const PADARIA = { name: "  Padaria do Zé ", color: "amber", icon: "store" } as const;
const OLD_HLC = "1759276800000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ";

let db: HomeFinanceDb;
let session: Session;
let books: BooksStore;

async function reopen() {
  session = createSession(testSessionDeps(db));
  books = createBooksStore(session);
  await session.init();
}

beforeEach(async () => {
  db = openTestDb();
  await reopen();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("createBusiness", () => {
  it("grava a linha, as categorias e as formas numa transação só e ativa a conta", async () => {
    expect(books.business.value).toBeNull();
    await books.createBusiness(PADARIA);

    expect(books.business.value).toMatchObject({
      id: BUSINESS_BOOK_ID,
      kind: "business",
      name: "Padaria do Zé",
      color: "amber",
      icon: "store",
    });
    expect(session.activeBook.value).toBe("business");
    expect((await db.meta.get(ACTIVE_BOOK_KEY))?.value).toBe("business");

    expect(await db.books.count()).toBe(1);
    const categories = await db.categories.toArray();
    const methods = await db.paymentMethods.toArray();
    expect(categories).toHaveLength(10);
    expect(methods).toHaveLength(5);
    // Todas da conta comercial, com o id estável dela.
    for (const row of [...categories, ...methods]) expect(bookOf(row)).toBe("business");
    expect(categories.map((c) => c.id)).toContain(defaultId("categories", "sales", "business"));
    expect(methods.map((m) => m.id)).toContain(defaultId("paymentMethods", "pix", "business"));
  });

  it("a visão da conta comercial já nasce com o catálogo, e a pessoal continua vazia", async () => {
    await books.createBusiness(PADARIA);
    expect(Object.keys(session.state.value.categories)).toHaveLength(10);
    expect(Object.keys(session.state.value.paymentMethods)).toHaveLength(5);

    await session.setActiveBook("personal");
    expect(Object.keys(session.state.value.categories)).toHaveLength(0);
    expect(Object.keys(session.state.value.paymentMethods)).toHaveLength(0);
    // A linha da conta aparece nas duas: é o que mostra o botão de troca.
    expect(books.business.value?.name).toBe("Padaria do Zé");
  });

  it("os ícones e as cores do catálogo existem no mapa e na paleta", async () => {
    await books.createBusiness(PADARIA);
    const rows = [...(await db.categories.toArray()), ...(await db.paymentMethods.toArray())];
    for (const row of rows) {
      expect(ICON_KEYS, row.name).toContain(row.icon);
      expect(COLOR_TOKENS, row.name).toContain(row.color);
    }
  });

  it("se o banco rejeitar, nada é gravado e a conta não muda", async () => {
    vi.spyOn(db.paymentMethods, "bulkPut").mockRejectedValueOnce(new Error("falhou"));
    await expect(books.createBusiness(PADARIA)).rejects.toThrow("falhou");

    expect(await db.books.count()).toBe(0);
    expect(await db.categories.count()).toBe(0);
    expect(books.business.value).toBeNull();
    expect(session.activeBook.value).toBe("personal");
    expect(session.error.value).toBe("falhou");

    // E dá para tentar de novo.
    await books.createBusiness(PADARIA);
    expect(books.business.value).not.toBeNull();
  });

  it("nome vazio não grava nada", async () => {
    await expect(books.createBusiness({ ...PADARIA, name: "   " })).rejects.toThrow(
      "Informe o nome do negócio.",
    );
    expect(await db.books.count()).toBe(0);
  });

  it("dois toques seguidos gravam uma vez só", async () => {
    const put = vi.spyOn(db.books, "bulkPut");
    await Promise.all([books.createBusiness(PADARIA), books.createBusiness(PADARIA)]);
    expect(put).toHaveBeenCalledTimes(1);
    expect(await db.books.count()).toBe(1);
  });

  it("se a conta já existe (outro aparelho criou), não regrava nada: só ativa", async () => {
    await books.createBusiness(PADARIA);
    await session.setActiveBook("personal");
    const before = await db.books.get(BUSINESS_BOOK_ID);

    await books.createBusiness({ name: "Outro nome", color: "sky", icon: "tag" });

    expect(await db.books.get(BUSINESS_BOOK_ID)).toEqual(before);
    expect(await db.categories.count()).toBe(10);
    expect(session.activeBook.value).toBe("business");
  });

  it("não rebaixa para a semente um padrão comercial que já chegou editado", async () => {
    const id = defaultId("categories", "sales", "business");
    await db.categories.put({
      id,
      name: "Vendas da loja",
      icon: "tag",
      color: "sky",
      kind: "income",
      book: "business",
      mergedInto: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: OLD_HLC,
      deletedAt: null,
      dirty: 0,
    });
    await reopen();

    await books.createBusiness(PADARIA);

    expect((await db.categories.get(id))?.name).toBe("Vendas da loja");
    expect(await db.categories.count()).toBe(10);
  });

  it("não mexe nos padrões pessoais já gravados com nome em comum", async () => {
    await db.categories.put({
      id: defaultId("categories", "bills"),
      name: "Contas",
      icon: "receipt",
      color: "slate",
      kind: "expense",
      mergedInto: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: OLD_HLC,
      deletedAt: null,
      dirty: 0,
    });
    await reopen();
    await books.createBusiness(PADARIA);

    expect(await db.categories.count()).toBe(11);
    expect(bookOf(await db.categories.get(defaultId("categories", "bills")))).toBe("personal");
  });
});

describe("repairActiveBook", () => {
  it("meta comercial sem linha viva volta para a pessoal ao abrir", async () => {
    await db.meta.put({ key: ACTIVE_BOOK_KEY, value: "business" });
    await reopen();
    expect(session.activeBook.value).toBe("business");

    await books.repairActiveBook();

    expect(session.activeBook.value).toBe("personal");
    expect((await db.meta.get(ACTIVE_BOOK_KEY))?.value).toBe("personal");
  });

  it("linha apagada chegando por reload (sync) tira a pessoa da conta comercial", async () => {
    await books.createBusiness(PADARIA);
    const row = await db.books.get(BUSINESS_BOOK_ID);
    if (row === undefined) throw new Error("sem linha");
    await db.books.put({ ...row, deletedAt: "9999999999999-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ" });
    await session.reload();
    expect(books.business.value).toBeNull();

    await books.repairActiveBook();

    expect(session.activeBook.value).toBe("personal");
  });

  it("com a conta viva ou já na pessoal, não faz nada", async () => {
    await books.createBusiness(PADARIA);
    await books.repairActiveBook();
    expect(session.activeBook.value).toBe("business");

    await session.setActiveBook("personal");
    await books.repairActiveBook();
    expect(session.activeBook.value).toBe("personal");
  });

  it("antes do boot não troca nada", async () => {
    const cold = createSession(testSessionDeps(db));
    await createBooksStore(cold).repairActiveBook();
    expect(cold.status.value).toBe("loading");
    expect(cold.activeBook.value).toBe("personal");
  });
});
