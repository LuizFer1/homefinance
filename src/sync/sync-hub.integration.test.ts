import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../data/db";
import { openTestDb } from "../data/test-db.fake";
import { budgetIdFor } from "../domain/budgets/budget-id";
import { listBudgets } from "../domain/budgets/list";
import { pendingCardGroups } from "../domain/cards/migration";
import { compareHlc } from "../domain/clock/hlc";
import {
  buildDefaultRows,
  DEFAULT_CATEGORIES,
  DEFAULT_METHODS,
  GENESIS_HLC,
  LEGACY_CREDIT_METHOD_ID,
} from "../domain/defaults/defaults";
import type { RandomChunk } from "../domain/ids/ulid";
import { bookOf } from "../domain/model/book";
import { BUSINESS_BOOK_ID } from "../domain/model/book-account";
import type { PaymentMethod } from "../domain/model/payment-method";
import { movement, reserve } from "../domain/reserves/fixtures.fake";
import { createBudgetsStore } from "../features/budgets/store";
import { createCardsStore } from "../features/cards/store";
import { createRecurrenceStore } from "../features/recurrence/store";
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

  it("a meta da mesma categoria definida nos dois aparelhos vira uma linha só", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);

    const cat = await a.registry.addCategory(MERCADO);
    await a.sync.sync();
    await b.sync.sync();

    // Offline nos dois: cada um define a meta da mesma categoria.
    await createBudgetsStore(a.session).set(cat.id, 40_000);
    await createBudgetsStore(b.session).set(cat.id, 55_000);
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();

    const rowsA = Object.values(a.session.state.value.budgets);
    const rowsB = Object.values(b.session.state.value.budgets);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    // B escreveu depois (relógio adiantado): vence nos dois.
    expect(rowsA[0]?.limitMinor).toBe(55_000);
    expect(rowsB[0]).toMatchObject({ limitMinor: 55_000, dirty: 0 });
    expect(rowsA[0]?.id).toBe(budgetIdFor(cat.id));

    // Apagar em um e refazer no outro converge sem duplicar.
    await createBudgetsStore(a.session).remove(cat.id);
    await a.sync.sync();
    await b.sync.sync();
    expect(listBudgets(b.session.state.value)).toEqual([]);

    await createBudgetsStore(b.session).set(cat.id, 30_000);
    await b.sync.sync();
    await a.sync.sync();
    expect(listBudgets(a.session.state.value).map((r) => r.limitMinor)).toEqual([30_000]);
    expect(Object.keys(a.session.state.value.budgets)).toHaveLength(1);
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
      expect(Object.values(d.session.state.value.paymentMethods)).toHaveLength(3);
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

describe("migração de cartões entre dois aparelhos", () => {
  const nubank = {
    name: "Nubank",
    icon: "credit-card",
    color: "violet",
    kind: "credit",
    bank: "Nubank",
    closingDay: 5,
    dueDay: 12,
  } as const;
  const purchase = (paymentMethodId: string, description: string) => ({
    kind: "expense" as const,
    description,
    amountMinor: 5_000,
    currency: "BRL" as const,
    categoryId: null,
    paymentMethodId,
    cashbackMinor: null,
    occurredOn: "2026-10-02",
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
  });

  it("migra num aparelho, o outro converge sem pendência, e a compra tardia segue o cartão", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    const cardsA = createCardsStore(a.session, a.db);
    const generic = LEGACY_CREDIT_METHOD_ID;

    // O genérico antigo (gênese) com uma compra, e um cartão completo, ambos no aparelho A.
    await a.session.putRows({
      paymentMethods: [
        {
          ...DEFAULT_METHODS.find((m) => m.id === generic)?.draft,
          id: generic,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: GENESIS_HLC,
          deletedAt: null,
          dirty: 1,
        } as PaymentMethod,
      ],
    });
    const nu = await a.registry.addPaymentMethod(nubank);
    const first = await a.session.mutate("transactions", (repo) =>
      repo.create(purchase(generic, "Mercado")),
    );
    await a.sync.sync();
    await b.sync.sync();
    expect(pendingCardGroups(b.session.state.value)).toHaveLength(1);

    // A migra e sobe.
    await cardsA.migrate({ [generic]: { kind: "existing", cardId: nu.id } });
    await a.sync.sync();
    await b.sync.sync();

    // B converge: nada pendente, a compra está no cartão, o genérico é lápide com mergedInto.
    expect(pendingCardGroups(b.session.state.value)).toEqual([]);
    expect(b.session.state.value.transactions[first.id]?.paymentMethodId).toBe(nu.id);
    expect(b.session.state.value.paymentMethods[generic]).toMatchObject({ mergedInto: nu.id });
    expect(b.session.state.value.paymentMethods[generic]?.deletedAt).not.toBeNull();

    // Um aparelho ainda na versão velha lança no genérico depois: segue para o cartão.
    const late = await b.session.mutate("transactions", (repo) =>
      repo.create(purchase(generic, "Compra tardia")),
    );
    await b.sync.sync();
    await a.sync.sync();
    for (const d of [a, b]) {
      expect(d.session.state.value.transactions[late.id]?.paymentMethodId).toBe(nu.id);
      expect(pendingCardGroups(d.session.state.value)).toEqual([]);
    }

    // Converge e para.
    const seq = hub.maxSeq();
    await a.sync.sync();
    await b.sync.sync();
    expect(hub.maxSeq()).toBe(seq);
  });
});

describe("autoria de série entre dois aparelhos", () => {
  const ANA = "01J9F3K2M7QX8YB4TVWZ0DCAN1";
  const BIA = "01J9F3K2M7QX8YB4TVWZ0DCB11";

  it("o mês gerado no aparelho de outra pessoa sai com o autor da série, nos dois", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    a.session.localUserId.value = ANA;
    b.session.localUserId.value = BIA;

    await createRecurrenceStore(a.session).createSeries(
      {
        kind: "expense",
        description: "Geladeira",
        amountMinor: 10_000,
        currency: "BRL",
        categoryId: null,
        paymentMethodId: null,
        cashbackMinor: null,
        occurredOn: "2026-06-15",
        recurrenceId: null,
        occurrenceKey: null,
      },
      {
        frequency: "monthly",
        scheduleType: "dayOfMonth",
        scheduleN: 15,
        endOn: null,
        variable: false,
        installments: 3,
      },
      "2026-06-20",
    );
    await a.sync.sync();
    await b.sync.sync();
    // B abre o app em agosto: gera julho e agosto.
    await createRecurrenceStore(b.session).materializeDue("2026-08-20");
    await b.sync.sync();
    await a.sync.sync();

    for (const d of [a, b]) {
      const parcelas = Object.values(d.session.state.value.transactions)
        .sort((x, y) => x.occurredOn.localeCompare(y.occurredOn))
        .map((t) => [t.occurredOn, t.amountMinor, t.userId]);
      expect(parcelas).toEqual([
        ["2026-06-15", 3_334, ANA],
        ["2026-07-15", 3_333, ANA],
        ["2026-08-15", 3_333, ANA],
      ]);
    }
  });
});

describe("duas contas, dois aparelhos, um hub", () => {
  const BUSINESS = BUSINESS_BOOK_ID;
  const VENDAS = { name: "Vendas", icon: "banknote", color: "emerald", kind: "income" } as const;

  function bookRow(d: Device, name: string) {
    return {
      ...({
        kind: "business",
        name,
        color: "amber",
        icon: "storefront",
        id: BUSINESS,
        createdAt: "2026-11-11T00:00:00.000Z",
        deletedAt: null,
      } as const),
      book: "business" as const,
      updatedAt: d.session.clock().stamp().hlc,
      dirty: 1 as const,
    };
  }

  it("as duas contas chegam ao outro aparelho, cada uma só na sua visão", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);

    const pessoal = await a.registry.addCategory(MERCADO);
    await a.session.setActiveBook("business");
    const comercial = await a.registry.addCategory(VENDAS);
    await a.session.putRows({ books: [bookRow(a, "Padaria")] });
    const bem = await a.session.mutate("assets", (repo) =>
      repo.create({
        kind: "equipment",
        name: "Forno",
        valueMinor: 500_000,
        acquiredOn: "2026-10-01",
      }),
    );
    const divida = await a.session.mutate("debts", (repo) =>
      repo.create({ name: "Financiamento", principalMinor: 400_000, balanceMinor: 300_000 }),
    );
    await a.sync.sync();
    await b.sync.sync();

    // O hub guarda a linha inteira, com o `book` dela.
    const noHub = (table: string, id: string) =>
      hub.rows().find((r) => r.table === table && r.id === id)?.row;
    expect(noHub("categories", pessoal.id)?.book).toBe("personal");
    expect(noHub("categories", comercial.id)?.book).toBe("business");
    expect(noHub("assets", bem.id)?.book).toBe("business");
    expect(noHub("debts", divida.id)?.book).toBe("business");

    // B abre na conta pessoal: só a pessoal aparece, mas a conta comercial passa a existir.
    expect(Object.keys(b.session.state.value.categories)).toEqual([pessoal.id]);
    expect(b.session.state.value.books[BUSINESS]?.name).toBe("Padaria");
    expect(b.session.state.value.assets).toEqual({});

    await b.session.setActiveBook("business");
    expect(Object.keys(b.session.state.value.categories)).toEqual([comercial.id]);
    expect(Object.keys(b.session.state.value.assets)).toEqual([bem.id]);
    expect(Object.keys(b.session.state.value.debts)).toEqual([divida.id]);
    for (const row of Object.values(b.session.fullState.value.categories)) {
      expect(bookOf(row)).toBe(row.id === pessoal.id ? "personal" : "business");
    }
  });

  it("a linha books criada nos dois aparelhos converge para uma só (id estável)", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);

    await a.session.putRows({ books: [bookRow(a, "Padaria A")] });
    await b.session.putRows({ books: [bookRow(b, "Padaria B")] });
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();

    for (const d of [a, b]) {
      expect(Object.keys(d.session.fullState.value.books)).toEqual([BUSINESS]);
      // B escreveu depois (relógio adiantado): vence nos dois.
      expect(d.session.fullState.value.books[BUSINESS]?.name).toBe("Padaria B");
    }
  });

  it("edição da mesma conta em aparelhos diferentes não mistura nem perde o book", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    await a.session.setActiveBook("business");
    const cat = await a.registry.addCategory(VENDAS);
    await a.sync.sync();
    await b.sync.sync();

    await b.session.setActiveBook("business");
    await b.registry.editCategory(cat.id, { ...VENDAS, name: "Vendas do balcão" });
    await b.sync.sync();
    await a.sync.sync();

    for (const d of [a, b]) {
      const row = d.session.fullState.value.categories[cat.id];
      expect(row).toMatchObject({ name: "Vendas do balcão", book: "business" });
    }
    // Nenhuma linha comercial vazou para a visão pessoal de A.
    await a.session.setActiveBook("personal");
    expect(a.session.state.value.categories[cat.id]).toBeUndefined();
  });
});
