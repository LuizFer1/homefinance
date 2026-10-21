import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCardMigrationDeferral } from "../../data/card-migration";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { card, legacyCard, purchase, series } from "../../domain/cards/fixtures.fake";
import { pendingCardGroups } from "../../domain/cards/migration";
import { LEGACY_CREDIT_METHOD_ID } from "../../domain/defaults/defaults";
import type { PaymentMethod } from "../../domain/model/payment-method";
import type { Transaction } from "../../domain/model/transaction";
import { createSession, type Session, StaleRowsError } from "../session/session";
import { type Destination, newCardProblem } from "./plan";
import { type CardsStore, createCardsStore } from "./store";

const OLD = LEGACY_CREDIT_METHOD_ID;

let db: HomeFinanceDb;

afterEach(async () => {
  await db.delete();
});

async function open(): Promise<{ session: Session; store: CardsStore }> {
  const session = createSession(testSessionDeps(db));
  await session.init();
  return { session, store: createCardsStore(session, db, () => 1_760_000_000_000) };
}

/** Linhas gravadas "de fábrica": com `ALIVE`, como se já tivessem vindo de uma versão anterior. */
async function seed(parts: {
  methods?: PaymentMethod[];
  transactions?: Transaction[];
  recurrences?: ReturnType<typeof series>[];
}) {
  await db.paymentMethods.bulkPut(parts.methods ?? []);
  await db.transactions.bulkPut(parts.transactions ?? []);
  await db.recurrences.bulkPut(parts.recurrences ?? []);
}

const NEW_CARD = { bank: "Nubank", name: "", closingDay: 5, dueDay: 12, color: "violet" } as const;

beforeEach(() => {
  db = openTestDb();
});

describe("migração de cartões: execução", () => {
  it("move os lançamentos e as séries para um cartão novo e aposenta o antigo com mergedInto", async () => {
    await seed({
      methods: [legacyCard(OLD, { name: "Cartão de crédito" })],
      transactions: [purchase("a", OLD, "2026-10-02"), purchase("b", OLD, "2026-10-03")],
      recurrences: [series("assinatura", OLD)],
    });
    const { session, store } = await open();

    const moved = await store.migrate({ [OLD]: { kind: "new", card: NEW_CARD } });

    expect(moved).toBe(2);
    const methods = await db.paymentMethods.toArray();
    const created = methods.find((m) => m.id !== OLD);
    expect(created).toMatchObject({
      name: "Nubank",
      kind: "credit",
      bank: "Nubank",
      closingDay: 5,
      dueDay: 12,
      color: "violet",
      deletedAt: null,
      dirty: 1,
    });
    const old = methods.find((m) => m.id === OLD);
    expect(old?.deletedAt).not.toBeNull();
    expect(old?.mergedInto).toBe(created?.id);
    expect((await db.transactions.toArray()).map((t) => t.paymentMethodId)).toEqual([
      created?.id,
      created?.id,
    ]);
    expect((await db.recurrences.get("assinatura"))?.paymentMethodId).toBe(created?.id);
    // A tela deixa de ver pendência na hora.
    expect(pendingCardGroups(session.state.value)).toEqual([]);
  });

  it("move para um cartão que já existe, sem criar outro", async () => {
    await seed({
      methods: [legacyCard(OLD), card("nu", { name: "Nubank" })],
      transactions: [purchase("a", OLD, "2026-10-02")],
    });
    const { store } = await open();

    await store.migrate({ [OLD]: { kind: "existing", cardId: "nu" } });

    expect(await db.paymentMethods.count()).toBe(2);
    expect((await db.transactions.get("a"))?.paymentMethodId).toBe("nu");
    expect((await db.paymentMethods.get(OLD))?.mergedInto).toBe("nu");
  });

  it("escolhe um destino por grupo", async () => {
    await seed({
      methods: [legacyCard(OLD), legacyCard("velho"), card("nu"), card("inter")],
      transactions: [purchase("a", OLD, "2026-10-02"), purchase("b", "velho", "2026-10-02")],
    });
    const { store } = await open();

    await store.migrate({
      [OLD]: { kind: "existing", cardId: "nu" },
      velho: { kind: "existing", cardId: "inter" },
    });

    expect((await db.transactions.get("a"))?.paymentMethodId).toBe("nu");
    expect((await db.transactions.get("b"))?.paymentMethodId).toBe("inter");
  });

  it("grupo sem escolha fica como está", async () => {
    await seed({
      methods: [legacyCard(OLD), legacyCard("velho"), card("nu")],
      transactions: [purchase("a", OLD, "2026-10-02"), purchase("b", "velho", "2026-10-02")],
    });
    const { session, store } = await open();

    await store.migrate({ [OLD]: { kind: "existing", cardId: "nu" } });

    expect((await db.transactions.get("b"))?.paymentMethodId).toBe("velho");
    expect(pendingCardGroups(session.state.value).map((g) => g.source.id)).toEqual(["velho"]);
  });

  it("é idempotente: rodar de novo não regrava nada", async () => {
    await seed({
      methods: [legacyCard(OLD), card("nu")],
      transactions: [purchase("a", OLD, "2026-10-02")],
    });
    const { store } = await open();
    const choice: Record<string, Destination> = { [OLD]: { kind: "existing", cardId: "nu" } };

    await store.migrate(choice);
    const after = await db.transactions.get("a");
    const again = await store.migrate(choice);

    expect(again).toBe(0);
    expect(await db.transactions.get("a")).toEqual(after);
  });

  it("depois da migração, um lançamento que chega apontando para o antigo segue para o destino", async () => {
    await seed({
      methods: [legacyCard(OLD), card("nu")],
      transactions: [purchase("a", OLD, "2026-10-02")],
    });
    const { session, store } = await open();
    await store.migrate({ [OLD]: { kind: "existing", cardId: "nu" } });

    // Outro aparelho, ainda na versão velha, lançou no genérico e sincronizou.
    await session.putRows({ transactions: [purchase("tardia", OLD, "2026-10-09")] });

    expect(session.state.value.transactions.tardia?.paymentMethodId).toBe("nu");
    expect(pendingCardGroups(session.state.value)).toEqual([]);
  });

  it("recusa destino inexistente, apagado ou ainda por completar, sem gravar nada", async () => {
    await seed({
      methods: [
        legacyCard(OLD),
        legacyCard("outro-velho"),
        card("morto", { deletedAt: "1754568000001-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ" }),
      ],
      transactions: [purchase("a", OLD, "2026-10-02")],
    });
    const { store } = await open();

    for (const cardId of ["fantasma", "morto", "outro-velho", OLD]) {
      await expect(store.migrate({ [OLD]: { kind: "existing", cardId } })).rejects.toThrow();
    }
    expect((await db.transactions.get("a"))?.paymentMethodId).toBe(OLD);
    expect((await db.paymentMethods.get(OLD))?.deletedAt).toBeNull();
  });

  it("recusa cartão novo com dados inválidos", async () => {
    await seed({ methods: [legacyCard(OLD)], transactions: [purchase("a", OLD, "2026-10-02")] });
    const { store } = await open();

    for (const bad of [
      { ...NEW_CARD, bank: "  " },
      { ...NEW_CARD, closingDay: 0 },
      { ...NEW_CARD, dueDay: 32 },
      { ...NEW_CARD, color: "neon" as never },
    ]) {
      expect(newCardProblem(bad)).not.toBeNull();
      await expect(store.migrate({ [OLD]: { kind: "new", card: bad } })).rejects.toThrow();
    }
    expect(await db.paymentMethods.count()).toBe(1);
  });

  it("nome vazio usa o banco; nome digitado vale", async () => {
    await seed({ methods: [legacyCard(OLD)], transactions: [purchase("a", OLD, "2026-10-02")] });
    const { store } = await open();

    await store.migrate({ [OLD]: { kind: "new", card: { ...NEW_CARD, name: "Roxinho" } } });

    const created = (await db.paymentMethods.toArray()).find((m) => m.id !== OLD);
    expect(created?.name).toBe("Roxinho");
    expect(created?.bank).toBe("Nubank");
  });
});

describe("migração de cartões: dois aparelhos e método apagado", () => {
  it("recusa com StaleRowsError se outro aparelho mexeu num lançamento, sem gravar nada", async () => {
    await seed({
      methods: [legacyCard(OLD), card("nu")],
      transactions: [purchase("a", OLD, "2026-10-02"), purchase("b", OLD, "2026-10-03")],
    });
    const a = await open();
    const b = await open();

    // O aparelho B (outra aba, aqui) reclassifica um lançamento antes de A confirmar.
    await b.session.mutate("transactions", (repo) => repo.update("b", { description: "mexido" }));

    await expect(
      a.store.migrate({ [OLD]: { kind: "existing", cardId: "nu" } }),
    ).rejects.toBeInstanceOf(StaleRowsError);
    expect((await db.transactions.get("a"))?.paymentMethodId).toBe(OLD);
    expect((await db.paymentMethods.get(OLD))?.deletedAt).toBeNull();
    // A sessão se cura com o que o banco tem: depois do reload, tentar de novo funciona.
    await a.session.reload();
    await expect(a.store.migrate({ [OLD]: { kind: "existing", cardId: "nu" } })).resolves.toBe(2);
    expect((await db.transactions.get("b"))?.description).toBe("mexido");
  });

  it("recusa se o outro aparelho já migrou (não migra duas vezes)", async () => {
    await seed({
      methods: [legacyCard(OLD), card("nu"), card("inter")],
      transactions: [purchase("a", OLD, "2026-10-02")],
    });
    const a = await open();
    const b = await open();

    await a.store.migrate({ [OLD]: { kind: "existing", cardId: "nu" } });

    await expect(
      b.store.migrate({ [OLD]: { kind: "existing", cardId: "inter" } }),
    ).rejects.toBeInstanceOf(StaleRowsError);
    expect((await db.transactions.get("a"))?.paymentMethodId).toBe("nu");
  });

  it("o estado que o outro aparelho recebe pelo sync não tem mais pendência", async () => {
    await seed({
      methods: [legacyCard(OLD), card("nu")],
      transactions: [purchase("a", OLD, "2026-10-02")],
      recurrences: [series("s", OLD)],
    });
    const a = await open();
    const b = await open();
    expect(pendingCardGroups(b.session.state.value)).toHaveLength(1);

    await a.store.migrate({ [OLD]: { kind: "existing", cardId: "nu" } });
    // O pull grava as linhas do hub no banco do B e ele recarrega.
    await b.session.reload();

    expect(pendingCardGroups(b.session.state.value)).toEqual([]);
    expect(b.session.state.value.transactions.a?.paymentMethodId).toBe("nu");
  });

  it("método apagado por outro aparelho antes de confirmar: o lote é recusado", async () => {
    await seed({
      methods: [legacyCard(OLD), card("nu")],
      transactions: [purchase("a", OLD, "2026-10-02")],
    });
    const a = await open();
    const b = await open();
    await b.session.mutate("paymentMethods", (repo) => repo.remove("nu"));

    await expect(
      a.store.migrate({ [OLD]: { kind: "existing", cardId: "nu" } }),
    ).rejects.toBeInstanceOf(StaleRowsError);
    expect((await db.transactions.get("a"))?.paymentMethodId).toBe(OLD);
  });

  it("lançamento apagado por outro aparelho antes de confirmar: o lote é recusado e não o ressuscita", async () => {
    await seed({
      methods: [legacyCard(OLD), card("nu")],
      transactions: [purchase("a", OLD, "2026-10-02"), purchase("b", OLD, "2026-10-03")],
    });
    const a = await open();
    const b = await open();
    await b.session.mutate("transactions", (repo) => repo.remove("b"));

    await expect(
      a.store.migrate({ [OLD]: { kind: "existing", cardId: "nu" } }),
    ).rejects.toBeInstanceOf(StaleRowsError);
    expect((await db.transactions.get("b"))?.deletedAt).not.toBeNull();
  });
});

describe("adiamento local ('Depois')", () => {
  it("grava a chave em meta e fecha o aviso nesta sessão", async () => {
    const { store } = await open();

    await store.defer();

    expect(store.deferred.value).toBe(true);
    expect(await readCardMigrationDeferral(db)).toBe(new Date(1_760_000_000_000).toISOString());
  });

  it("volta no próximo boot: init limpa a chave e o sinal", async () => {
    const first = await open();
    await first.store.defer();

    const second = await open();
    await second.store.init();

    expect(second.store.deferred.value).toBe(false);
    expect(await readCardMigrationDeferral(db)).toBeNull();
  });

  it("a chave não é uma tabela de entidade: nunca vai para o hub", async () => {
    const { store } = await open();
    await store.defer();
    // Só `meta` guarda o adiamento; nenhuma linha de entidade foi tocada.
    for (const table of ["paymentMethods", "transactions", "recurrences"] as const) {
      expect(await db.table(table).count()).toBe(0);
    }
  });
});
