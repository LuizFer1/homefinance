import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../data/db";
import { buildRow } from "../data/repository";
import { openTestDb } from "../data/test-db.fake";
import { budgetIdFor, budgetSeed } from "../domain/budgets/budget-id";
import { budgetOf, listBudgets } from "../domain/budgets/list";
import { pendingCardGroups } from "../domain/cards/migration";
import { compareHlc } from "../domain/clock/hlc";
import {
  buildDefaultRows,
  DEFAULT_CATEGORIES,
  DEFAULT_METHODS,
  GENESIS_HLC,
  LEGACY_CREDIT_METHOD_ID,
} from "../domain/defaults/defaults";
import { collidingId } from "../domain/ids/collision.fake";
import { stableEntityIdV1, stableEntityIdV2 } from "../domain/ids/stable-id";
import type { RandomChunk } from "../domain/ids/ulid";
import { parseStatement } from "../domain/import/parse";
import { classifyImport, type ImportContext, importSeeds, planImport } from "../domain/import/plan";
import { bookOf } from "../domain/model/book";
import { BUSINESS_BOOK_ID } from "../domain/model/book-account";
import type { Budget } from "../domain/model/budget";
import type { Category } from "../domain/model/category";
import type { PaymentMethod } from "../domain/model/payment-method";
import type { Recurrence } from "../domain/model/recurrence";
import type { RecurrenceAdjustment } from "../domain/model/recurrence-adjustment";
import type { Transaction } from "../domain/model/transaction";
import {
  adjustmentForKey,
  adjustmentId,
  adjustmentSeed,
  adjustmentsOf,
  amountFor,
} from "../domain/recurrence/adjustments";
import { recoveryCandidates } from "../domain/recurrence/recovery";
import { occurrenceKey } from "../domain/recurrence/schedule";
import { depositId, depositSeed } from "../domain/reserves/deposits";
import { movement, reserve } from "../domain/reserves/fixtures.fake";
import { createBudgetsStore } from "../features/budgets/store";
import { createCardsStore } from "../features/cards/store";
import { createImportStore } from "../features/import/store";
import { createRecurrenceStore } from "../features/recurrence/store";
import { createRegistryStore, type RegistryStore } from "../features/registry/store";
import { createReservesStore } from "../features/reserves/store";
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

/**
 * Spec do id estável, §8 e §10 (Fase 1): um aparelho na versão nova e outro na
 * velha, o velho sempre gravando **depois** (relógio 60 s à frente, vence o LWW).
 * Não há como injetar a função de id, então o velho é simulado gravando direto no
 * Dexie dele o que o app velho gravaria: id v1 da chave e, se o lugar já tem
 * linha, `...existing` por cima dela — reajuste mantém `recurrenceId`/`fromPeriod`
 * de quem estava lá, meta troca o `categoryId`.
 */
describe("versões misturadas: reajuste e meta", () => {
  const SERIE_A = "01JZ0000000000000000000SRA";
  const adjSeed = (series: string) => adjustmentSeed(series, "2027-01");
  const SERIE_B = collidingId("01JZ0000000000000000000", SERIE_A, adjSeed);
  const ADJ_SLOT = stableEntityIdV1(adjSeed(SERIE_A));
  const ADJ_V2_B = stableEntityIdV2(adjSeed(SERIE_B));

  const CAT_A = "01JZ0000000000000000000CTA";
  const CAT_B = collidingId("01JZ0000000000000000000", CAT_A, budgetSeed);
  const BGT_SLOT = stableEntityIdV1(budgetSeed(CAT_A));
  const BGT_V2_B = stableEntityIdV2(budgetSeed(CAT_B));

  /** O `adjustmentRow` do app velho: lugar pelo id v1, espalhando quem estiver lá. */
  async function velhoReajusta(d: Device, recurrenceId: string, amountMinor: number) {
    const id = adjustmentId(recurrenceId, "2027-01");
    const existing = d.session.state.value.recurrenceAdjustments[id];
    const clock = d.session.clock();
    const row: RecurrenceAdjustment =
      existing === undefined
        ? buildRow<RecurrenceAdjustment>(
            clock,
            { recurrenceId, fromPeriod: "2027-01", amountMinor },
            id,
          )
        : { ...existing, amountMinor, deletedAt: null, updatedAt: clock.stamp().hlc, dirty: 1 };
    await d.session.putRows({ recurrenceAdjustments: [row] });
  }

  /** O `budgets.set` do app velho: lugar pelo id v1, troca o `categoryId` de quem estiver lá. */
  async function velhoDefineMeta(d: Device, categoryId: string, limitMinor: number) {
    const id = budgetIdFor(categoryId);
    const existing = d.session.state.value.budgets[id];
    const clock = d.session.clock();
    const row: Budget =
      existing === undefined
        ? buildRow<Budget>(clock, { categoryId, limitMinor }, id)
        : {
            ...existing,
            categoryId,
            limitMinor,
            deletedAt: null,
            updatedAt: clock.stamp().hlc,
            dirty: 1,
          };
    await d.session.putRows({ budgets: [row] });
  }

  const novoReajusta = (d: Device, recurrenceId: string, amountMinor: number) =>
    createRecurrenceStore(d.session).adjustSeries({
      recurrenceId,
      fromPeriod: "2027-01",
      amountMinor,
    });

  /** Novo (A, relógio atrás) e velho (B, 60 s à frente), com as séries e categorias do par. */
  async function cenario() {
    const hub = createFakeHub();
    const novo = await device(hub, "novo", 0);
    const velho = await device(hub, "velho", 60_000);
    const clock = novo.session.clock();
    const serie = (id: string) =>
      buildRow<Recurrence>(
        clock,
        {
          kind: "income",
          description: id,
          amountMinor: 300_000,
          currency: "BRL",
          categoryId: null,
          paymentMethodId: null,
          cashbackMinor: null,
          frequency: "monthly",
          scheduleType: "dayOfMonth",
          scheduleN: 5,
          // Longe no futuro: nada materializa e nenhuma ocorrência disputa lugar.
          startOn: "2030-01-05",
          endOn: null,
          active: true,
        },
        id,
      );
    const categoria = (id: string) =>
      buildRow<Category>(clock, { name: id, icon: "tag", color: "sky", kind: "expense" }, id);
    await novo.session.putRows({
      recurrences: [serie(SERIE_A), serie(SERIE_B)],
      categories: [categoria(CAT_A), categoria(CAT_B)],
    });
    await novo.sync.sync();
    await velho.sync.sync();
    return { novo, velho };
  }

  /** Novo empurra, velho empurra e puxa, novo puxa: os dois com o mesmo estado. */
  async function sincroniza(novo: Device, velho: Device) {
    await novo.sync.sync();
    await velho.sync.sync();
    await novo.sync.sync();
  }

  const reajustes = (d: Device) =>
    Object.values(d.session.state.value.recurrenceAdjustments)
      .map(({ id, recurrenceId, amountMinor, deletedAt, updatedAt }) => ({
        id,
        recurrenceId,
        amountMinor,
        deleted: deletedAt !== null,
        updatedAt,
      }))
      .sort((x, y) => (x.id < y.id ? -1 : 1));

  const metas = (d: Device) =>
    Object.values(d.session.state.value.budgets)
      .map(({ id, categoryId, limitMinor, deletedAt, updatedAt }) => ({
        id,
        categoryId,
        limitMinor,
        deleted: deletedAt !== null,
        updatedAt,
      }))
      .sort((x, y) => (x.id < y.id ? -1 : 1));

  /** O valor que cada aparelho mostra para a série em 2027-03 (regra R no `amountFor`). */
  const vale = (d: Device, series: string) => {
    const state = d.session.state.value;
    const row = state.recurrences[series];
    if (row === undefined) throw new Error("série sumiu");
    return amountFor(row, adjustmentsOf(state, series), "2027-03");
  };

  describe("reajuste", () => {
    it("(1) lugar livre: o novo grava em v1, o velho regrava a chave: uma linha, LWW", async () => {
      const { novo, velho } = await cenario();
      await novoReajusta(novo, SERIE_B, 350_000);
      expect(novo.session.state.value.recurrenceAdjustments[ADJ_SLOT]).toBeDefined();
      await sincroniza(novo, velho);

      await velhoReajusta(velho, SERIE_B, 360_000);
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) {
        expect(reajustes(d)).toHaveLength(1);
        expect(reajustes(d)[0]).toMatchObject({ id: ADJ_SLOT, recurrenceId: SERIE_B });
        expect(vale(d, SERIE_B)).toBe(360_000);
      }
      expect(reajustes(novo)).toEqual(reajustes(velho));
    });

    it("(2) lugar de outra série: o v2 de B segue intacto; o velho reescreve A (bug dele)", async () => {
      const { novo, velho } = await cenario();
      await novoReajusta(novo, SERIE_A, 350_000);
      await novoReajusta(novo, SERIE_B, 450_000);
      const v2DeB = novo.session.state.value.recurrenceAdjustments[ADJ_V2_B];
      expect(v2DeB).toMatchObject({ recurrenceId: SERIE_B, amountMinor: 450_000 });
      await sincroniza(novo, velho);

      // O velho "reajusta B": acha o reajuste de A no lugar v1 e troca o valor dele.
      await velhoReajusta(velho, SERIE_B, 460_000);
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) {
        expect(d.session.state.value.recurrenceAdjustments[ADJ_V2_B]).toMatchObject({
          id: ADJ_V2_B,
          recurrenceId: SERIE_B,
          amountMinor: 450_000,
          updatedAt: v2DeB?.updatedAt,
          deletedAt: null,
        });
        expect(vale(d, SERIE_B)).toBe(450_000);
        // Documentado: o velho continua com o bug até atualizar — o valor de A
        // virou o que a pessoa digitou para B. Só a atualização corrige.
        expect(d.session.state.value.recurrenceAdjustments[ADJ_SLOT]).toMatchObject({
          recurrenceId: SERIE_A,
          amountMinor: 460_000,
        });
      }
      expect(reajustes(novo)).toEqual(reajustes(velho));
    });

    it("(3) corrida: a mesma chave em v1 (velho) e v2 (novo): a regra R escolhe a mesma", async () => {
      const { novo, velho } = await cenario();
      // Offline nos dois. O novo tem A no lugar v1 e por isso grava B em v2; o
      // velho não conhece A e grava B no v1.
      await novoReajusta(novo, SERIE_A, 350_000);
      await novoReajusta(novo, SERIE_B, 450_000);
      await velhoReajusta(velho, SERIE_B, 460_000);
      await sincroniza(novo, velho);
      await velho.sync.sync();

      for (const d of [novo, velho]) {
        const deB = reajustes(d).filter((row) => row.recurrenceId === SERIE_B);
        expect(deB.map((row) => row.id).sort()).toEqual([ADJ_SLOT, ADJ_V2_B].sort());
        // O velho gravou depois (relógio à frente): vence pela regra R.
        expect(vale(d, SERIE_B)).toBe(460_000);
        expect(adjustmentsOf(d.session.state.value, SERIE_B)).toHaveLength(1);
        expect(adjustmentForKey(d.session.state.value, SERIE_B, "2027-01")?.id).toBe(ADJ_SLOT);
      }
      expect(reajustes(novo)).toEqual(reajustes(velho));
      // Cenário B da spec (§5): o lugar v1 disputado ficou com o velho, e o reajuste
      // de A, nunca sincronizado antes, se perdeu. Raro; recuperável à mão.
      expect(reajustes(novo).some((row) => row.recurrenceId === SERIE_A)).toBe(false);

      // Editar no novo cai na vencedora (a que a tela mostra) e passa a valer nos dois.
      await novoReajusta(novo, SERIE_B, 470_000);
      await sincroniza(novo, velho);
      for (const d of [novo, velho]) expect(vale(d, SERIE_B)).toBe(470_000);
    });
  });

  describe("meta", () => {
    it("(1) lugar livre: o novo grava em v1, o velho regrava a categoria: uma linha, LWW", async () => {
      const { novo, velho } = await cenario();
      await createBudgetsStore(novo.session).set(CAT_B, 20_000);
      expect(novo.session.state.value.budgets[BGT_SLOT]).toBeDefined();
      await sincroniza(novo, velho);

      await velhoDefineMeta(velho, CAT_B, 25_000);
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) {
        expect(metas(d)).toHaveLength(1);
        expect(budgetOf(d.session.state.value, CAT_B)).toMatchObject({
          id: BGT_SLOT,
          limitMinor: 25_000,
        });
      }
      expect(metas(novo)).toEqual(metas(velho));
    });

    it("(2) lugar de outra categoria: o v2 de B segue intacto; o velho toma a meta de A", async () => {
      const { novo, velho } = await cenario();
      await createBudgetsStore(novo.session).set(CAT_A, 20_000);
      await createBudgetsStore(novo.session).set(CAT_B, 30_000);
      const v2DeB = novo.session.state.value.budgets[BGT_V2_B];
      expect(v2DeB).toMatchObject({ categoryId: CAT_B, limitMinor: 30_000 });
      await sincroniza(novo, velho);

      // O velho "define a meta de B": acha a de A no lugar v1 e troca a categoria.
      await velhoDefineMeta(velho, CAT_B, 35_000);
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) {
        const state = d.session.state.value;
        expect(state.budgets[BGT_V2_B]).toMatchObject({
          categoryId: CAT_B,
          limitMinor: 30_000,
          updatedAt: v2DeB?.updatedAt,
          deletedAt: null,
        });
        // Documentado: o bug do velho. A ficou sem meta, e B tem duas vivas (v1 do
        // velho, v2 do novo); a regra R mostra a última edição, a do velho.
        expect(budgetOf(state, CAT_A)).toBeNull();
        expect(state.budgets[BGT_SLOT]).toMatchObject({ categoryId: CAT_B, limitMinor: 35_000 });
        expect(budgetOf(state, CAT_B)).toMatchObject({ id: BGT_SLOT, limitMinor: 35_000 });
      }
      expect(metas(novo)).toEqual(metas(velho));
    });

    it("(3) corrida: a mesma categoria em v1 (velho) e v2 (novo): a regra R escolhe a mesma", async () => {
      const { novo, velho } = await cenario();
      await createBudgetsStore(novo.session).set(CAT_A, 20_000);
      await createBudgetsStore(novo.session).set(CAT_B, 30_000);
      await velhoDefineMeta(velho, CAT_B, 35_000);
      await sincroniza(novo, velho);
      await velho.sync.sync();

      for (const d of [novo, velho]) {
        const state = d.session.state.value;
        const deB = metas(d).filter((row) => row.categoryId === CAT_B);
        expect(deB.map((row) => row.id).sort()).toEqual([BGT_SLOT, BGT_V2_B].sort());
        expect(budgetOf(state, CAT_B)).toMatchObject({ id: BGT_SLOT, limitMinor: 35_000 });
        expect(listBudgets(state).filter((row) => row.categoryId === CAT_B)).toHaveLength(1);
      }
      expect(metas(novo)).toEqual(metas(velho));

      // Editar no novo cai na vencedora e passa a valer nos dois.
      await createBudgetsStore(novo.session).set(CAT_B, 40_000);
      await sincroniza(novo, velho);
      for (const d of [novo, velho]) {
        expect(budgetOf(d.session.state.value, CAT_B)).toMatchObject({
          id: BGT_SLOT,
          limitMinor: 40_000,
        });
      }
    });
  });
});

describe("reparo de duplicatas entre dois aparelhos", () => {
  const S = "01JC0000000000000000000001";
  const K = occurrenceKey(S, "2027-02");
  const V1 = stableEntityIdV1(K);
  const V2 = stableEntityIdV2(K);

  function ocorrencia(d: Device, id: string, over: Partial<Transaction> = {}) {
    return buildRow<Transaction>(
      d.session.clock(),
      {
        kind: "expense",
        description: "Luz",
        amountMinor: 10_000,
        currency: "BRL",
        categoryId: null,
        paymentMethodId: null,
        cashbackMinor: null,
        occurredOn: "2027-02-05",
        userId: null,
        recurrenceId: S,
        occurrenceKey: K,
        estimated: true,
        ...over,
      },
      id,
    );
  }

  const vivas = (d: Device) =>
    Object.values(d.session.state.value.transactions)
      .filter((row) => row.deletedAt === null && row.occurrenceKey === K)
      .map((row) => row.id);

  it("estados divergentes (A sem a confirmação, B com ela): exatamente uma viva, a v1", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    // O cenário C já aconteceu: as duas cópias chegaram aos dois aparelhos.
    await a.session.putRows({ transactions: [ocorrencia(a, V1), ocorrencia(a, V2)] });
    await a.sync.sync();
    await b.sync.sync();

    // B confirma a cópia v2 (a que a tela dele mostrou) antes de reparar.
    const v2 = b.session.state.value.transactions[V2];
    if (v2 === undefined) throw new Error("v2 não chegou");
    await b.session.putRows({
      transactions: [
        {
          ...v2,
          estimated: false,
          amountMinor: 12_345,
          updatedAt: b.session.clock().stamp().hlc,
          dirty: 1,
        },
      ],
    });

    // Os dois reparam offline, cada um com o seu estado.
    await createRecurrenceStore(a.session).repairDuplicates();
    await createRecurrenceStore(b.session).repairDuplicates();

    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();

    for (const d of [a, b]) {
      expect(vivas(d)).toEqual([V1]);
      // A confirmação feita só na v2 sobreviveu na v1: A não regravou a v1 (para
      // ele a v2 era estimativa), então a cópia de B é a última versão dela.
      expect(d.session.state.value.transactions[V1]).toMatchObject({
        estimated: false,
        amountMinor: 12_345,
      });
    }
  });

  /**
   * Relógios e quem grava as cópias, nas combinações que importam ao reparo
   * ancorado: `a` repara, `b` confirma sem saber do reparo. Com `a` à frente e
   * gravando as cópias, `b` observa a versão delas e confirma no **mesmo**
   * milissegundo, contador + 1 — o mesmo HLC do carimbo do reparo, menos o
   * `deviceId`. Nas duas ordens de `deviceId`, a confirmação tem de vencer.
   */
  const CASOS = [
    { a: 60_000, b: 0, copias: "b" },
    { a: 60_000, b: 0, copias: "a" },
    { a: 0, b: 60_000, copias: "a" },
    { a: 0, b: 60_000, copias: "b" },
  ] as const;

  async function caso(c: (typeof CASOS)[number], copias: (d: Device) => Transaction[]) {
    const hub = createFakeHub();
    const a = await device(hub, "A", c.a);
    const b = await device(hub, "B", c.b);
    const w = c.copias === "a" ? a : b;
    await w.session.putRows({ transactions: copias(w) });
    await w.sync.sync();
    await a.sync.sync();
    await b.sync.sync();
    return { a, b };
  }

  async function confirma(d: Device, id: string, amountMinor: number) {
    const row = d.session.state.value.transactions[id];
    if (row === undefined) throw new Error(`${id} não chegou`);
    await d.session.putRows({
      transactions: [
        {
          ...row,
          estimated: false,
          amountMinor,
          updatedAt: d.session.clock().stamp().hlc,
          dirty: 1,
        },
      ],
    });
  }

  it("confirmação na v2 feita noutro aparelho depois do reparo: revive a v2 e o próximo reparo a leva para a v1", async () => {
    for (const c of CASOS) {
      const { a, b } = await caso(c, (d) => [ocorrencia(d, V1), ocorrencia(d, V2)]);

      await createRecurrenceStore(a.session).repairDuplicates();
      await confirma(b, V2, 12_345);
      await a.sync.sync();
      await b.sync.sync();
      await a.sync.sync();
      // A confirmação venceu o tombstone do reparo: a v2 voltou.
      expect(vivas(a).sort(), JSON.stringify(c)).toEqual([V1, V2].sort());

      await createRecurrenceStore(a.session).repairDuplicates();
      await a.sync.sync();
      await b.sync.sync();

      for (const d of [a, b]) {
        expect(vivas(d)).toEqual([V1]);
        expect(d.session.state.value.transactions[V1], JSON.stringify(c)).toMatchObject({
          estimated: false,
          amountMinor: 12_345,
        });
      }
    }
  });

  it("a cópia da confirmação para a v1 não passa por cima da confirmação feita na própria v1", async () => {
    for (const c of CASOS) {
      // Cenário C com a v2 já confirmada e a v1 ainda estimada.
      const { a, b } = await caso(c, (d) => [
        ocorrencia(d, V1),
        ocorrencia(d, V2, { estimated: false, amountMinor: 11_111 }),
      ]);

      // `b` confirma a v1 (a que a tela dele mostra) com outro valor; `a`, ainda
      // sem isso, repara copiando a confirmação da v2.
      await confirma(b, V1, 22_222);
      await createRecurrenceStore(a.session).repairDuplicates();
      await a.sync.sync();
      await b.sync.sync();
      await a.sync.sync();

      for (const d of [a, b]) {
        expect(vivas(d)).toEqual([V1]);
        expect(d.session.state.value.transactions[V1], JSON.stringify(c)).toMatchObject({
          estimated: false,
          amountMinor: 22_222,
        });
      }
    }
  });

  function serieS(d: Device): Recurrence {
    return buildRow<Recurrence>(
      d.session.clock(),
      {
        kind: "expense",
        description: "Luz",
        amountMinor: 10_000,
        currency: "BRL",
        categoryId: null,
        paymentMethodId: null,
        cashbackMinor: null,
        frequency: "monthly",
        scheduleType: "dayOfMonth",
        scheduleN: 5,
        startOn: "2027-02-05",
        endOn: "2027-02-05",
        active: true,
      },
      S,
    );
  }

  /**
   * O cenário do achado 4: o novo repara (apaga a v2) enquanto o velho, que ainda
   * vê as duas cópias, apaga a v1 como "a duplicata". Depois do sync, zero vivas.
   */
  async function reparoEApagaV1() {
    const hub = createFakeHub();
    const novo = await device(hub, "novo", 0);
    const velho = await device(hub, "velho", 60_000);
    await novo.session.putRows({
      recurrences: [serieS(novo)],
      transactions: [ocorrencia(novo, V1), ocorrencia(novo, V2)],
    });
    await novo.sync.sync();
    await velho.sync.sync();

    await createRecurrenceStore(novo.session).repairDuplicates();
    const v1 = velho.session.state.value.transactions[V1];
    if (v1 === undefined) throw new Error("v1 não chegou");
    const { hlc } = velho.session.clock().stamp();
    await velho.session.putRows({
      transactions: [{ ...v1, deletedAt: hlc, updatedAt: hlc, dirty: 1 }],
    });
    await novo.sync.sync();
    await velho.sync.sync();
    await novo.sync.sync();
    for (const d of [novo, velho]) expect(vivas(d)).toEqual([]);
    return { novo, velho };
  }

  it("reparo e exclusão da v1 no velho ao mesmo tempo: a folha pergunta, e Recriar revive a v2", async () => {
    const { novo, velho } = await reparoEApagaV1();
    const lost = recoveryCandidates(novo.session.fullState.value, "personal", "2027-03-10");
    expect(lost.map((item) => item.entityId)).toEqual([V2]);

    await createRecurrenceStore(novo.session).recoverOccurrences(lost, []);
    await novo.sync.sync();
    await velho.sync.sync();

    for (const d of [novo, velho]) {
      expect(vivas(d)).toEqual([V2]);
      expect(recoveryCandidates(d.session.fullState.value, "personal", "2027-03-10")).toEqual([]);
    }
    // A v2 revivida não é mais par de ninguém: a v1 está apagada.
    await createRecurrenceStore(novo.session).repairDuplicates();
    expect(vivas(novo)).toEqual([V2]);
  });

  it("reparo e exclusão da v1 no velho: Não recriar tira a pergunta dos dois aparelhos", async () => {
    const { novo, velho } = await reparoEApagaV1();
    const lost = recoveryCandidates(velho.session.fullState.value, "personal", "2027-03-10");
    expect(lost.map((item) => item.entityId)).toEqual([V2]);

    await createRecurrenceStore(velho.session).recoverOccurrences([], lost);
    await velho.sync.sync();
    await novo.sync.sync();

    for (const d of [novo, velho]) {
      expect(vivas(d)).toEqual([]);
      expect(recoveryCandidates(d.session.fullState.value, "personal", "2027-03-10")).toEqual([]);
    }
  });

  it("resposta atrasada à pergunta do reparo não revive o que o outro recriou e apagou", async () => {
    const { novo, velho } = await reparoEApagaV1();
    const lostNovo = recoveryCandidates(novo.session.fullState.value, "personal", "2027-03-10");
    const lostVelho = recoveryCandidates(velho.session.fullState.value, "personal", "2027-03-10");

    await createRecurrenceStore(novo.session).recoverOccurrences(lostNovo, []);
    const revivida = novo.session.state.value.transactions[V2];
    if (revivida === undefined) throw new Error("não reviveu");
    const { hlc } = novo.session.clock().stamp();
    await novo.session.putRows({
      transactions: [{ ...revivida, deletedAt: hlc, updatedAt: hlc, dirty: 1 }],
    });
    await novo.sync.sync();

    // O velho (relógio à frente), ainda sem nada disso, responde Recriar também.
    await createRecurrenceStore(velho.session).recoverOccurrences(lostVelho, []);
    await velho.sync.sync();
    await novo.sync.sync();
    await velho.sync.sync();

    for (const d of [novo, velho]) expect(vivas(d)).toEqual([]);
  });

  it("Não recriar atrasado à pergunta do reparo não apaga o que o outro recriou e confirmou", async () => {
    const { novo, velho } = await reparoEApagaV1();
    const lostNovo = recoveryCandidates(novo.session.fullState.value, "personal", "2027-03-10");
    const lostVelho = recoveryCandidates(velho.session.fullState.value, "personal", "2027-03-10");

    await createRecurrenceStore(novo.session).recoverOccurrences(lostNovo, []);
    const revivida = novo.session.state.value.transactions[V2];
    if (revivida === undefined) throw new Error("não reviveu");
    await novo.session.putRows({
      transactions: [
        {
          ...revivida,
          estimated: false,
          amountMinor: 12_345,
          updatedAt: novo.session.clock().stamp().hlc,
          dirty: 1,
        },
      ],
    });
    await novo.sync.sync();

    await createRecurrenceStore(velho.session).recoverOccurrences([], lostVelho);
    await velho.sync.sync();
    await novo.sync.sync();
    await velho.sync.sync();

    for (const d of [novo, velho]) {
      expect(vivas(d)).toEqual([V2]);
      expect(d.session.state.value.transactions[V2]?.amountMinor).toBe(12_345);
    }
  });

  it("os dois reparam o mesmo par sem divergência: ainda uma viva, a v1", async () => {
    const hub = createFakeHub();
    const a = await device(hub, "A", 0);
    const b = await device(hub, "B", 60_000);
    await a.session.putRows({ transactions: [ocorrencia(a, V1), ocorrencia(a, V2)] });
    await a.sync.sync();
    await b.sync.sync();

    await createRecurrenceStore(a.session).repairDuplicates();
    await createRecurrenceStore(b.session).repairDuplicates();
    await a.sync.sync();
    await b.sync.sync();
    await a.sync.sync();

    expect(vivas(a)).toEqual([V1]);
    expect(vivas(b)).toEqual([V1]);
  });
});

describe("versões misturadas: ocorrência, depósito e importação", () => {
  // Par verificado da spec (§2): A em 2027-02 e B em 2027-01 caem no mesmo v1.
  const A = "01JC0000000000000000000001";
  const B = "01JC0000000000000000000002";
  const KA = occurrenceKey(A, "2027-02");
  const KB = occurrenceKey(B, "2027-01");
  const SLOT = stableEntityIdV1(KA);
  const HOJE = "2027-02-10";

  function serie(d: Device, id: string, startOn: string): Recurrence {
    return buildRow<Recurrence>(
      d.session.clock(),
      {
        kind: "expense",
        description: id,
        amountMinor: 10_000,
        currency: "BRL",
        categoryId: null,
        paymentMethodId: null,
        cashbackMinor: null,
        frequency: "monthly",
        scheduleType: "dayOfMonth",
        scheduleN: 5,
        startOn,
        endOn: null,
        active: true,
      },
      id,
    );
  }

  /** Uma ocorrência como o app (velho ou novo) a grava, no id pedido. */
  function ocorrencia(d: Device, id: string, series: string, key: string, occurredOn: string) {
    return buildRow<Transaction>(
      d.session.clock(),
      {
        kind: "expense",
        description: series,
        amountMinor: 10_000,
        currency: "BRL",
        categoryId: null,
        paymentMethodId: null,
        cashbackMinor: null,
        occurredOn,
        userId: null,
        recurrenceId: series,
        occurrenceKey: key,
      },
      id,
    );
  }

  /** O `planOccurrences` do app velho para uma chave: id v1, pula se o id existe. */
  async function velhoMaterializa(d: Device, series: string, period: string) {
    const key = occurrenceKey(series, period);
    const id = stableEntityIdV1(key);
    if (d.session.state.value.transactions[id] !== undefined) return;
    await d.session.putRows({ transactions: [ocorrencia(d, id, series, key, `${period}-05`)] });
  }

  const novoMaterializa = (d: Device, today = HOJE) =>
    createRecurrenceStore(d.session).materializeDue(today);

  const vivasDa = (d: Device, key: string) =>
    Object.values(d.session.state.value.transactions)
      .filter((row) => row.deletedAt === null && row.occurrenceKey === key)
      .map((row) => row.id)
      .sort();

  async function dois() {
    const hub = createFakeHub();
    const novo = await device(hub, "novo", 0);
    const velho = await device(hub, "velho", 60_000);
    return { novo, velho };
  }

  async function sincroniza(novo: Device, velho: Device) {
    await novo.sync.sync();
    await velho.sync.sync();
    await novo.sync.sync();
  }

  describe("ocorrência", () => {
    it("(1) lugar livre: o novo grava em v1, o velho grava a mesma chave depois: uma linha", async () => {
      const { novo, velho } = await dois();
      await novo.session.putRows({ recurrences: [serie(novo, A, "2027-02-05")] });
      await sincroniza(novo, velho);

      await novoMaterializa(novo);
      // O velho, offline, gera a mesma competência antes de receber a do novo.
      await velhoMaterializa(velho, A, "2027-02");
      await sincroniza(novo, velho);

      expect(vivasDa(novo, KA)).toEqual([SLOT]);
      expect(vivasDa(velho, KA)).toEqual([SLOT]);
    });

    it("(2) lugar de outro fato: o novo grava em v2; o velho pula (o bug dele) e a v2 fica", async () => {
      const { novo, velho } = await dois();
      await novo.session.putRows({
        recurrences: [serie(novo, A, "2027-02-05")],
        transactions: [ocorrencia(novo, SLOT, B, KB, "2027-01-05")],
      });
      await sincroniza(novo, velho);

      await novoMaterializa(novo);
      await velhoMaterializa(velho, A, "2027-02");
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) {
        expect(vivasDa(d, KA)).toEqual([stableEntityIdV2(KA)]);
        expect(vivasDa(d, KB)).toEqual([SLOT]);
      }
    });

    it("(3) corrida: a mesma chave em v1 (velho) e v2 (novo): o reparo deixa uma, a v1", async () => {
      const { novo, velho } = await dois();
      await novo.session.putRows({ recurrences: [serie(novo, A, "2027-02-05")] });
      await sincroniza(novo, velho);
      // Só o novo tem a ocorrência de B no lugar (o velho ainda não a recebeu).
      await novo.session.putRows({ transactions: [ocorrencia(novo, SLOT, B, KB, "2027-01-05")] });

      await novoMaterializa(novo);
      await velhoMaterializa(velho, A, "2027-02");
      await sincroniza(novo, velho);
      // O cenário C: as duas cópias vivas (o A do velho venceu o lugar de B).
      expect(vivasDa(novo, KA)).toEqual([SLOT, stableEntityIdV2(KA)].sort());
      // O pull roda o reparo (como o `afterPull` do app novo).
      await createRecurrenceStore(novo.session).repairDuplicates();
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) expect(vivasDa(d, KA)).toEqual([SLOT]);
    });

    it("B: fatos diferentes no mesmo lugar livre, offline: os dois existem depois do boot novo", async () => {
      const { novo, velho } = await dois();
      const C = collidingId("01JC0000000000000000000", A, (id) => occurrenceKey(id, "2027-02"));
      const KC = occurrenceKey(C, "2027-02");
      // Cada aparelho só conhece uma das séries quando materializa, offline.
      await novo.session.putRows({ recurrences: [serie(novo, A, "2027-02-05")] });
      await velho.session.putRows({ recurrences: [serie(velho, C, "2027-02-05")] });
      await novoMaterializa(novo);
      await velhoMaterializa(velho, C, "2027-02");

      // O velho grava depois (relógio à frente): o LWW do lugar fica com C.
      await sincroniza(novo, velho);
      expect(vivasDa(novo, KA)).toEqual([]);

      // O boot (ou o pull) seguinte do novo grava A em v2: o mês é o corrente.
      await novoMaterializa(novo);
      await sincroniza(novo, velho);
      for (const d of [novo, velho]) {
        expect(vivasDa(d, KA)).toEqual([stableEntityIdV2(KA)]);
        expect(vivasDa(d, KC)).toEqual([SLOT]);
      }
    });

    it("E: apagada no velho não volta no novo", async () => {
      const { novo, velho } = await dois();
      await novo.session.putRows({ recurrences: [serie(novo, A, "2027-02-05")] });
      await novoMaterializa(novo);
      await sincroniza(novo, velho);

      const row = velho.session.state.value.transactions[SLOT];
      if (row === undefined) throw new Error("não chegou");
      const { hlc } = velho.session.clock().stamp();
      await velho.session.putRows({
        transactions: [{ ...row, deletedAt: hlc, updatedAt: hlc, dirty: 1 }],
      });
      await sincroniza(novo, velho);
      await novoMaterializa(novo);
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) {
        expect(vivasDa(d, KA)).toEqual([]);
        expect(Object.keys(d.session.state.value.transactions)).toEqual([SLOT]);
      }
    });

    it("folha de recuperação: a resposta de um aparelho tira a pergunta do outro", async () => {
      const { novo, velho } = await dois();
      // Fevereiro de A perdido: o lugar é de B, e hoje já é março.
      const marco = "2027-03-10";
      await novo.session.putRows({
        recurrences: [serie(novo, A, "2027-02-05")],
        transactions: [ocorrencia(novo, SLOT, B, KB, "2027-01-05")],
      });
      await novoMaterializa(novo, marco);
      await sincroniza(novo, velho);

      const lost = recoveryCandidates(novo.session.fullState.value, "personal", marco);
      expect(lost.map((item) => item.draft.occurrenceKey)).toEqual([KA]);
      // O outro aparelho, com o mesmo estado, acha a mesma candidata.
      expect(
        recoveryCandidates(velho.session.fullState.value, "personal", marco).map(
          (item) => item.entityId,
        ),
      ).toEqual(lost.map((item) => item.entityId));

      await createRecurrenceStore(novo.session).recoverOccurrences([], lost);
      await sincroniza(novo, velho);

      expect(recoveryCandidates(velho.session.fullState.value, "personal", marco)).toEqual([]);
      const resposta = velho.session.state.value.transactions[stableEntityIdV2(KA)];
      expect(resposta?.deletedAt).not.toBeNull();
      expect(resposta?.occurrenceKey).toBe(KA);
    });
  });

  describe("depósito mensal", () => {
    const R1 = "01JC0000000000000000000001";
    const R2 = collidingId("01JC0000000000000000000", R1, (id) => depositSeed(id, "2027-02"));
    const [FIRST = "", SECOND = ""] = [R1, R2].sort();
    const regra = { amountMinor: 1_000, day: 1, since: "2027-01" };

    async function comSaldo(d: Device, reservas: string[]) {
      await d.session.putRows({
        reserves: reservas.map((id) =>
          reserve(id, { recurring: regra, updatedAt: d.session.clock().stamp().hlc, dirty: 1 }),
        ),
        transactions: [
          buildRow<Transaction>(d.session.clock(), {
            kind: "income",
            description: "Salário",
            amountMinor: 900_000,
            currency: "BRL",
            categoryId: null,
            paymentMethodId: null,
            cashbackMinor: null,
            occurredOn: "2027-02-01",
            userId: null,
            recurrenceId: null,
            occurrenceKey: null,
          }),
        ],
      });
    }

    /** O `planDeposits` do app velho: id v1, pula se o id existe. */
    async function velhoDeposita(d: Device, reserveId: string) {
      const id = depositId(reserveId, "2027-02");
      if (d.session.state.value.reserveMovements[id] !== undefined) return;
      await d.session.putRows({
        reserveMovements: [
          movement(id, reserveId, 1_000, HOJE, {
            recurring: true,
            updatedAt: d.session.clock().stamp().hlc,
            dirty: 1,
          }),
        ],
      });
    }

    const novoDeposita = (d: Device) => createReservesStore(d.session).materializeDue(HOJE);

    const depositosDe = (d: Device, reserveId: string) =>
      Object.values(d.session.state.value.reserveMovements)
        .filter(
          (row) => row.deletedAt === null && row.reserveId === reserveId && row.recurring === true,
        )
        .map((row) => row.id)
        .sort();

    it("o par colide na v1", () => {
      expect(depositId(R2, "2027-02")).toBe(depositId(R1, "2027-02"));
    });

    it("(1) lugar livre: o novo grava em v1, o velho grava o mesmo depois: uma linha", async () => {
      const { novo, velho } = await dois();
      await comSaldo(novo, [R1]);
      await sincroniza(novo, velho);
      await novoDeposita(novo);
      await velhoDeposita(velho, R1);
      await sincroniza(novo, velho);
      for (const d of [novo, velho]) expect(depositosDe(d, R1)).toEqual([depositId(R1, "2027-02")]);
    });

    it("(2) lugar de outra reserva: o novo grava em v2; o velho pula e a v2 fica", async () => {
      const { novo, velho } = await dois();
      await comSaldo(novo, [FIRST, SECOND]);
      await sincroniza(novo, velho);
      // O velho deposita a primeira reserva antes, e o novo recebe.
      await velhoDeposita(velho, FIRST);
      await sincroniza(novo, velho);

      await novoDeposita(novo);
      await velhoDeposita(velho, SECOND);
      await sincroniza(novo, velho);

      // Um segundo aparelho já atualizado recebe a v2 com `period` e não deposita de novo.
      await novoDeposita(velho);
      await sincroniza(novo, velho);
      const v2 = stableEntityIdV2(depositSeed(SECOND, "2027-02"));
      for (const d of [novo, velho]) {
        expect(depositosDe(d, FIRST)).toEqual([depositId(FIRST, "2027-02")]);
        expect(depositosDe(d, SECOND)).toEqual([v2]);
        expect(d.session.state.value.reserveMovements[v2]?.period).toBe("2027-02");
      }
    });

    it("(3) corrida: o mesmo depósito em v1 (velho) e v2 (novo): o reparo deixa uma, a v1", async () => {
      const { novo, velho } = await dois();
      await comSaldo(novo, [SECOND]);
      await sincroniza(novo, velho);
      // Só o novo tem o depósito da outra reserva no lugar.
      await novo.session.putRows({
        reserveMovements: [
          movement(depositId(FIRST, "2027-02"), FIRST, 1_000, HOJE, {
            recurring: true,
            period: "2027-02",
            updatedAt: novo.session.clock().stamp().hlc,
            dirty: 1,
          }),
        ],
      });

      await novoDeposita(novo);
      await velhoDeposita(velho, SECOND);
      await sincroniza(novo, velho);
      expect(depositosDe(novo, SECOND)).toEqual(
        [depositId(SECOND, "2027-02"), stableEntityIdV2(depositSeed(SECOND, "2027-02"))].sort(),
      );
      await createRecurrenceStore(novo.session).repairDuplicates();
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) {
        expect(depositosDe(d, SECOND)).toEqual([depositId(SECOND, "2027-02")]);
      }
    });
  });

  describe("importação", () => {
    const ctx: ImportContext = { paymentMethodId: null, referenceMonth: "2027-02" };
    const linhas = () =>
      parseStatement(["12/02 IFOOD 45,90"], "account", "2027-02").entries.map((e) => ({
        ...e,
        selected: true,
        categoryId: null,
      }));
    const [SEED = ""] = importSeeds(linhas(), ctx);
    const I1 = stableEntityIdV1(SEED);
    const I2 = stableEntityIdV2(SEED);

    const slotsDe = (d: Device) => ({
      transactions: d.session.fullState.value.transactions,
      recurrences: d.session.fullState.value.recurrences,
    });

    const novoImporta = (d: Device) =>
      createImportStore(d.session, createRecurrenceStore(d.session)).commit(
        planImport(linhas(), ctx, slotsDe(d)),
        HOJE,
      );

    /** A revisão do app velho: "Já importado" se o id v1 existe; senão grava em v1. */
    async function velhoImporta(d: Device) {
      if (d.session.state.value.transactions[I1] !== undefined) return;
      const [plan] = planImport(linhas(), ctx).transactions;
      if (plan === undefined) throw new Error("sem linha");
      const { importKey: _novo, ...antigo } = plan.draft;
      await d.session.putRows({
        transactions: [buildRow<Transaction>(d.session.clock(), { ...antigo, userId: null }, I1)],
      });
    }

    const ifood = (d: Device) =>
      Object.values(d.session.state.value.transactions)
        .filter((row) => row.deletedAt === null && row.description === "IFOOD")
        .map((row) => row.id)
        .sort();

    it("(1) lugar livre: o novo grava em v1, o velho reimporta depois: uma linha", async () => {
      const { novo, velho } = await dois();
      await novoImporta(novo);
      await sincroniza(novo, velho);
      await velhoImporta(velho);
      await sincroniza(novo, velho);
      for (const d of [novo, velho]) expect(ifood(d)).toEqual([I1]);
      expect(classifyImport(linhas(), ctx, slotsDe(novo))[0]?.status).toBe("imported");
    });

    it("(2) lugar de outro fato: o novo grava em v2; o velho vê 'Já importado' e a v2 fica", async () => {
      const { novo, velho } = await dois();
      await novo.session.putRows({ transactions: [ocorrencia(novo, I1, B, KB, "2027-01-05")] });
      await sincroniza(novo, velho);
      expect(classifyImport(linhas(), ctx, slotsDe(novo))[0]?.status).toBe("maybe");

      await novoImporta(novo);
      await velhoImporta(velho);
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) {
        expect(ifood(d)).toEqual([I2]);
        expect(d.session.state.value.transactions[I1]?.recurrenceId).toBe(B);
      }
    });

    it("parcela com o lugar de outra série: nasce em v2 e o outro aparelho atualizado a reconhece", async () => {
      const { novo, velho } = await dois();
      const cartao: ImportContext = { paymentMethodId: "CARTAO-1", referenceMonth: "2027-02" };
      const fatura = (lines: string[], ref: string) =>
        parseStatement(lines, "card", ref).entries.map((e) => ({
          ...e,
          selected: true,
          categoryId: null,
        }));
      const fev = fatura(["15/12 LOJA 03/10 150,00"], "2027-02");
      const [seed = ""] = importSeeds(fev, cartao);
      // Outra série (de outra compra) já mora no lugar v1 da série desta.
      await novo.session.putRows({
        recurrences: [{ ...serie(novo, stableEntityIdV1(seed), "2030-01-05"), amountMinor: 1 }],
      });
      await sincroniza(novo, velho);

      await createImportStore(novo.session, createRecurrenceStore(novo.session)).commit(
        planImport(fev, cartao, slotsDe(novo)),
        HOJE,
      );
      await sincroniza(novo, velho);

      const v2 = stableEntityIdV2(seed);
      expect(velho.session.state.value.recurrences[v2]?.importKey).toBe(v2);
      // A fatura seguinte, aberta no outro aparelho, acha a série.
      const mar = fatura(["15/12 LOJA 04/10 150,00"], "2027-03");
      expect(
        classifyImport(mar, { ...cartao, referenceMonth: "2027-03" }, slotsDe(velho)).map(
          (t) => t.status,
        ),
      ).toEqual(["imported"]);
    });

    it("(3) corrida: o velho em v1 (livre para ele) e o novo em v2: as duas ficam (documentado)", async () => {
      // Sem reparo automático: a avulsa do velho não tem chave gravada que prove
      // ser o mesmo fato. O LWW do lugar v1 fica com ela (gravou depois), a
      // ocorrência que estava lá some (cenário B) e a compra aparece duas vezes.
      // A reimportação a reconhece; a duplicata se apaga à mão.
      const { novo, velho } = await dois();
      await novo.session.putRows({ transactions: [ocorrencia(novo, I1, B, KB, "2027-01-05")] });
      await novoImporta(novo);
      await velhoImporta(velho);
      await sincroniza(novo, velho);

      for (const d of [novo, velho]) expect(ifood(d)).toEqual([I1, I2].sort());
      expect(classifyImport(linhas(), ctx, slotsDe(novo))[0]?.status).toBe("imported");
    });

    it("corrida entre dois aparelhos novos (v1 e v2 com a mesma importKey): o reparo deixa a v1", async () => {
      // As duas cópias levam `importKey = v2(semente)`: aí a chave prova o mesmo fato.
      const { novo, velho: outroNovo } = await dois();
      await novo.session.putRows({ transactions: [ocorrencia(novo, I1, B, KB, "2027-01-05")] });
      await novoImporta(novo);
      await novoImporta(outroNovo);
      await sincroniza(novo, outroNovo);
      expect(ifood(novo)).toEqual([I1, I2].sort());

      await createRecurrenceStore(novo.session).repairDuplicates();
      await sincroniza(novo, outroNovo);

      for (const d of [novo, outroNovo]) {
        expect(ifood(d)).toEqual([I1]);
        expect(d.session.state.value.transactions[I2]?.mergedInto).toBe(I1);
      }
      expect(classifyImport(linhas(), ctx, slotsDe(novo))[0]?.status).toBe("imported");
    });
  });
});

describe("folha de recuperação entre dois aparelhos: a resposta perde para escrita real", () => {
  // Par verificado da spec (§2): A em 2027-02 e B em 2027-01 caem no mesmo v1.
  const A = "01JC0000000000000000000001";
  const B = "01JC0000000000000000000002";
  const KA = occurrenceKey(A, "2027-02");
  const KB = occurrenceKey(B, "2027-01");
  const SLOT = stableEntityIdV1(KA);
  const V2 = stableEntityIdV2(KA);
  const MARCO = "2027-03-10";
  // Os relógios andam com o calendário dos testes (março de 2027): uma resposta
  // ancorada no passado só é "baixa" diante de uma escrita feita depois dela.
  const EM_MARCO = Date.UTC(2027, 2, 10) - 1_754_697_600_000;

  function serie(d: Device, variable = false): Recurrence {
    return buildRow<Recurrence>(
      d.session.clock(),
      {
        kind: "expense",
        description: "Luz",
        amountMinor: 10_000,
        currency: "BRL",
        categoryId: null,
        paymentMethodId: null,
        cashbackMinor: null,
        frequency: "monthly",
        scheduleType: "dayOfMonth",
        scheduleN: 5,
        startOn: "2027-02-05",
        endOn: null,
        active: true,
        ...(variable ? { variable: true } : {}),
      },
      A,
    );
  }

  function deB(d: Device): Transaction {
    return buildRow<Transaction>(
      d.session.clock(),
      {
        kind: "expense",
        description: "B",
        amountMinor: 10_000,
        currency: "BRL",
        categoryId: null,
        paymentMethodId: null,
        cashbackMinor: null,
        occurredOn: "2027-01-05",
        userId: null,
        recurrenceId: B,
        occurrenceKey: KB,
      },
      SLOT,
    );
  }

  /** `x` e `y` com a série e o lugar de fevereiro tomado por B, os dois já sincronizados. */
  async function dois(ordem: "x-antes" | "y-antes" = "x-antes", variable = false) {
    const hub = createFakeHub();
    const [first, second] = ordem === "x-antes" ? [0, 60_000] : [60_000, 0];
    const x = await device(hub, "x", EM_MARCO + first);
    const y = await device(hub, "y", EM_MARCO + second);
    await x.session.putRows({ recurrences: [serie(x, variable)], transactions: [deB(x)] });
    await x.sync.sync();
    await y.sync.sync();
    return { x, y };
  }

  async function sincroniza(x: Device, y: Device) {
    await x.sync.sync();
    await y.sync.sync();
    await x.sync.sync();
  }

  const v2De = (d: Device) => d.session.state.value.transactions[V2];

  it("Recriar atrasado não revive a linha que o outro recriou e apagou", async () => {
    const { x, y } = await dois();
    const lost = recoveryCandidates(x.session.fullState.value, "personal", MARCO);
    expect(lost.map((item) => item.entityId)).toEqual([V2]);

    await createRecurrenceStore(x.session).recoverOccurrences(lost, []);
    const recriada = v2De(x);
    if (recriada === undefined) throw new Error("não recriou");
    const { hlc } = x.session.clock().stamp();
    await x.session.putRows({
      transactions: [{ ...recriada, deletedAt: hlc, updatedAt: hlc, dirty: 1 }],
    });
    await x.sync.sync();

    // y ainda não recebeu nada disso: para ele fevereiro segue perdido.
    const lostY = recoveryCandidates(y.session.fullState.value, "personal", MARCO);
    await createRecurrenceStore(y.session).recoverOccurrences(lostY, []);
    await sincroniza(x, y);

    for (const d of [x, y]) expect(v2De(d)?.deletedAt).not.toBeNull();
  });

  it("Não recriar atrasado não apaga a linha que o outro recriou e confirmou", async () => {
    const { x, y } = await dois();
    const lost = recoveryCandidates(x.session.fullState.value, "personal", MARCO);
    await createRecurrenceStore(x.session).recoverOccurrences(lost, []);
    const recriada = v2De(x);
    if (recriada === undefined) throw new Error("não recriou");
    await x.session.putRows({
      transactions: [
        { ...recriada, amountMinor: 12_345, updatedAt: x.session.clock().stamp().hlc, dirty: 1 },
      ],
    });
    await x.sync.sync();

    const lostY = recoveryCandidates(y.session.fullState.value, "personal", MARCO);
    await createRecurrenceStore(y.session).recoverOccurrences([], lostY);
    await sincroniza(x, y);

    for (const d of [x, y]) {
      expect(v2De(d)).toMatchObject({ deletedAt: null, amountMinor: 12_345 });
    }
  });

  it("respostas diferentes nos dois aparelhos, offline: Recriar vence", async () => {
    for (const ordem of ["x-antes", "y-antes"] as const) {
      const { x, y } = await dois(ordem);
      const lostX = recoveryCandidates(x.session.fullState.value, "personal", MARCO);
      const lostY = recoveryCandidates(y.session.fullState.value, "personal", MARCO);
      await createRecurrenceStore(x.session).recoverOccurrences([], lostX);
      await createRecurrenceStore(y.session).recoverOccurrences(lostY, []);
      await sincroniza(x, y);

      for (const d of [x, y]) expect(v2De(d)?.deletedAt).toBeNull();
    }
  });

  // Virada do mês com relógios diferentes (achado 6): para x ainda é fevereiro e
  // ele grava fevereiro em v2 (mês corrente); y já está em março, ainda sem a
  // linha de x, e vê fevereiro como perdido.
  for (const variable of [false, true]) {
    it(`virada do mês: o Não recriar de quem já está em março não apaga o mês corrente do outro${
      variable ? " (estimativa ancorada)" : ""
    }`, async () => {
      for (const ordem of ["x-antes", "y-antes"] as const) {
        const { x, y } = await dois(ordem, variable);
        await createRecurrenceStore(x.session).materializeDue("2027-02-28");
        expect(v2De(x)?.deletedAt).toBeNull();

        const lostY = recoveryCandidates(y.session.fullState.value, "personal", "2027-03-01");
        expect(lostY.map((item) => item.entityId)).toEqual([V2]);
        await createRecurrenceStore(y.session).recoverOccurrences([], lostY);
        await sincroniza(x, y);

        for (const d of [x, y]) expect(v2De(d)?.deletedAt).toBeNull();
      }
    });
  }
});
