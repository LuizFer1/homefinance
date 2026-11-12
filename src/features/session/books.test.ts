import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { buildRow } from "../../data/repository";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { compareHlc } from "../../domain/clock/hlc";
import { bookOf } from "../../domain/model/book";
import { type BookAccount, BUSINESS_BOOK_ID } from "../../domain/model/book-account";
import type { Category } from "../../domain/model/category";
import type { PaymentMethod } from "../../domain/model/payment-method";
import type { User } from "../../domain/model/user";
import { findCategory } from "../../domain/projections/selectors";
import { ACTIVE_BOOK_KEY, createSession, type Session } from "./session";

const VENDAS = { name: "Vendas", icon: "banknote", color: "emerald", kind: "income" } as const;
const MERCADO = { name: "Mercado", icon: "utensils", color: "orange", kind: "expense" } as const;
const BUSINESS_ID = BUSINESS_BOOK_ID;

let db: HomeFinanceDb;
let session: Session;

beforeEach(async () => {
  db = openTestDb();
  session = createSession(testSessionDeps(db));
  await session.init();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("conta ativa", () => {
  it("abre na conta pessoal por padrão", () => {
    expect(session.activeBook.value).toBe("personal");
  });

  it("lembra a conta ao reabrir (meta.activeBook)", async () => {
    await session.setActiveBook("business");
    expect((await db.meta.get(ACTIVE_BOOK_KEY))?.value).toBe("business");

    const reaberta = createSession(testSessionDeps(db));
    await reaberta.init();
    expect(reaberta.activeBook.value).toBe("business");
  });

  it("valor desconhecido na meta abre na pessoal", async () => {
    await db.meta.put({ key: ACTIVE_BOOK_KEY, value: "franchise" });
    const reaberta = createSession(testSessionDeps(db));
    await reaberta.init();
    expect(reaberta.activeBook.value).toBe("personal");
  });

  it("se o banco rejeitar, a conta não muda e o erro aparece", async () => {
    vi.spyOn(db.meta, "put").mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(session.setActiveBook("business")).rejects.toThrow("quota exceeded");
    expect(session.activeBook.value).toBe("personal");
    expect(session.error.value).toBe("quota exceeded");
  });
});

describe("visão filtrada", () => {
  it("state mostra só a conta ativa e fullState mostra as duas", async () => {
    const pessoal = await session.mutate("categories", (repo) => repo.create(MERCADO));
    await session.setActiveBook("business");
    const comercial = await session.mutate("categories", (repo) => repo.create(VENDAS));

    expect(Object.keys(session.state.value.categories)).toEqual([comercial.id]);
    expect(Object.keys(session.fullState.value.categories).sort()).toEqual(
      [pessoal.id, comercial.id].sort(),
    );

    await session.setActiveBook("personal");
    expect(Object.keys(session.state.value.categories)).toEqual([pessoal.id]);
  });

  it("users e books passam inteiros nas duas contas", async () => {
    const user = buildRow<User>(session.clock(), {
      name: "Luiz",
      color: "teal",
      avatar: null,
    });
    const book = buildRow<BookAccount>(
      session.clock(),
      { kind: "business", name: "Padaria", color: "amber", icon: "storefront" },
      BUSINESS_ID,
      "business",
    );
    await session.putRows({ users: [user], books: [book] });

    for (const conta of ["personal", "business"] as const) {
      await session.setActiveBook(conta);
      expect(session.state.value.users[user.id]).toEqual(user);
      expect(session.state.value.books[BUSINESS_ID]).toEqual(book);
    }
  });

  it("o boot carrega as linhas das duas contas e das tabelas novas", async () => {
    await session.setActiveBook("business");
    const asset = await session.mutate("assets", (repo) =>
      repo.create({
        kind: "inventory",
        name: "Estoque",
        valueMinor: 100_000,
        acquiredOn: "2026-11-01",
      }),
    );
    const debt = await session.mutate("debts", (repo) =>
      repo.create({ name: "Forno", principalMinor: 90_000, balanceMinor: 70_000 }),
    );

    await session.setActiveBook("personal");
    const reaberta = createSession(testSessionDeps(db));
    await reaberta.init();

    expect(reaberta.fullState.value.assets[asset.id]).toEqual(asset);
    expect(reaberta.fullState.value.debts[debt.id]).toEqual(debt);
    // Reaberta na conta pessoal: as duas linhas existem mas não aparecem.
    expect(reaberta.state.value.assets).toEqual({});
    await reaberta.setActiveBook("business");
    expect(Object.keys(reaberta.state.value.assets)).toEqual([asset.id]);
  });

  it("reload publica a linha de outra conta no estado completo sem aparecer na ativa", async () => {
    const remota = buildRow<Category>(session.clock(), VENDAS, undefined, "business");
    await db.categories.put(remota);

    await session.reload();

    expect(session.fullState.value.categories[remota.id]).toEqual(remota);
    expect(session.state.value.categories[remota.id]).toBeUndefined();
  });

  it("a referência entre contas cai em Sem categoria na visão da conta", async () => {
    const cat = await session.mutate("categories", (repo) => repo.create(MERCADO));
    await session.setActiveBook("business");
    const venda = await session.mutate("transactions", (repo) =>
      repo.create({
        kind: "expense",
        description: "Compra",
        amountMinor: 1_000,
        currency: "BRL",
        categoryId: cat.id,
        paymentMethodId: null,
        cashbackMinor: null,
        occurredOn: "2026-11-10",
        userId: null,
        recurrenceId: null,
        occurrenceKey: null,
      }),
    );

    expect(venda.categoryId).toBe(cat.id);
    expect(findCategory(session.state.value, cat.id)).toBeNull();
    await session.setActiveBook("personal");
    expect(findCategory(session.state.value, cat.id)?.name).toBe("Mercado");
  });
});

describe("escrita carimba a conta", () => {
  it("mutate/create grava o book ativo", async () => {
    const pessoal = await session.mutate("categories", (repo) => repo.create(MERCADO));
    await session.setActiveBook("business");
    const comercial = await session.mutate("categories", (repo) => repo.create(VENDAS));

    expect(bookOf(pessoal)).toBe("personal");
    expect(pessoal.book).toBe("personal");
    expect(comercial.book).toBe("business");
    expect((await db.categories.get(comercial.id))?.book).toBe("business");
  });

  it("users nunca recebe book", async () => {
    await session.setActiveBook("business");
    const user = await session.mutate("users", (repo) =>
      repo.create({ name: "Luiz", color: "teal", avatar: null }),
    );
    expect(user).not.toHaveProperty("book");
  });

  it("editar na outra conta não muda o book da linha", async () => {
    await session.setActiveBook("business");
    const comercial = await session.mutate("categories", (repo) => repo.create(VENDAS));
    await session.setActiveBook("personal");
    // A linha não está na visão pessoal, mas o repositório a acha pelo id.
    const editada = await session.mutate("categories", (repo) =>
      repo.update(comercial.id, { name: "Receitas" }),
    );
    expect(editada.book).toBe("business");
  });

  it("o relógio é semeado pelo maior HLC das duas contas", async () => {
    await session.setActiveBook("business");
    const comercial = await session.mutate("categories", (repo) => repo.create(VENDAS));
    await session.setActiveBook("personal");

    const reaberta = createSession({ ...testSessionDeps(db), now: () => 1_000 });
    await reaberta.init();
    // Abre na conta pessoal, vazia: sem o `fullState` o relógio nasceria do zero.
    expect(reaberta.state.value.categories).toEqual({});
    const proximo = await reaberta.mutate("categories", (repo) => repo.create(MERCADO));
    expect(compareHlc(proximo.updatedAt, comercial.updatedAt)).toBe(1);
  });
});

describe("criação da conta comercial (lote atômico)", () => {
  function lote() {
    const clock = session.clock();
    const book = buildRow<BookAccount>(
      clock,
      { kind: "business", name: "Padaria", color: "amber", icon: "storefront" },
      BUSINESS_ID,
      "business",
    );
    const category = buildRow<Category>(clock, VENDAS, undefined, "business");
    const method = buildRow<PaymentMethod>(
      clock,
      { name: "Pix", icon: "zap", color: "teal", kind: "pix" },
      undefined,
      "business",
    );
    return { books: [book], categories: [category], paymentMethods: [method] };
  }

  it("grava a linha books e os padrões numa transação só", async () => {
    const rows = lote();
    await session.putRows(rows);

    expect(await db.books.count()).toBe(1);
    expect(await db.categories.count()).toBe(1);
    expect(await db.paymentMethods.count()).toBe(1);
    expect(session.state.value.books[BUSINESS_ID]?.kind).toBe("business");
  });

  it("se uma tabela falhar, nada é gravado e o estado não muda", async () => {
    vi.spyOn(db.paymentMethods, "bulkPut").mockRejectedValueOnce(new Error("falhou"));
    await expect(session.putRows(lote())).rejects.toThrow("falhou");

    expect(await db.books.count()).toBe(0);
    expect(await db.categories.count()).toBe(0);
    expect(session.fullState.value.books).toEqual({});
  });
});
