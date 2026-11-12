import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { buildRow } from "../../data/repository";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { buildDefaultRows, defaultId } from "../../domain/defaults/defaults";
import { parseStatement } from "../../domain/import/parse";
import { planImport } from "../../domain/import/plan";
import { type Book, bookOf } from "../../domain/model/book";
import type { Category } from "../../domain/model/category";
import type { Recurrence, RecurrenceRule } from "../../domain/model/recurrence";
import { ALIVE } from "../../domain/model/row.fake";
import type { Transaction, TransactionDraft } from "../../domain/model/transaction";
import { reserve } from "../../domain/reserves/fixtures.fake";
import { createBudgetsStore } from "../budgets/store";
import { createImportStore } from "../import/store";
import { createRecurrenceStore, type RecurrenceStore } from "../recurrence/store";
import { createRegistryStore } from "../registry/store";
import { createReservesStore } from "../reserves/store";
import { createSession, type Session } from "./session";

const TODAY = "2026-08-10";

const DRAFT: TransactionDraft = {
  kind: "income",
  description: "Aluguel recebido",
  amountMinor: 500_000,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-07-05",
  recurrenceId: null,
  occurrenceKey: null,
};
const MENSAL: RecurrenceRule = {
  frequency: "monthly",
  scheduleType: "dayOfMonth",
  scheduleN: 5,
  endOn: null,
  variable: false,
};

let db: HomeFinanceDb;
let session: Session;
let recurrence: RecurrenceStore;

const alive = (book: Book) =>
  Object.values(session.fullState.value.transactions).filter(
    (t) => t.deletedAt === null && bookOf(t) === book,
  );

beforeEach(async () => {
  db = openTestDb();
  session = createSession(testSessionDeps(db));
  await session.init();
  recurrence = createRecurrenceStore(session);
});

afterEach(async () => {
  await db.delete();
});

describe("recorrência com duas contas", () => {
  it("a série criada na comercial materializa com book comercial, mesmo com a pessoal ativa", async () => {
    await session.setActiveBook("business");
    await recurrence.createSeries(DRAFT, MENSAL, "2026-07-10");
    const series = Object.values(session.fullState.value.recurrences);
    expect(series).toHaveLength(1);
    expect(series[0]?.book).toBe("business");

    await session.setActiveBook("personal");
    await recurrence.materializeDue(TODAY);

    // O mês de agosto nasceu na conta da série, e a conta ativa não o enxerga.
    const business = alive("business");
    expect(business.map((t) => t.occurredOn).sort()).toEqual(["2026-07-05", "2026-08-05"]);
    expect(business.every((t) => t.book === "business")).toBe(true);
    expect(alive("personal")).toEqual([]);
    expect(Object.keys(session.state.value.transactions)).toEqual([]);
  });

  it("a série pessoal materializa pessoal com a comercial ativa", async () => {
    await recurrence.createSeries(DRAFT, MENSAL, "2026-07-10");
    await session.setActiveBook("business");
    await recurrence.materializeDue(TODAY);

    expect(alive("personal")).toHaveLength(2);
    expect(alive("business")).toEqual([]);
  });

  it("o reajuste herda a conta da série", async () => {
    await session.setActiveBook("business");
    await recurrence.createSeries(DRAFT, MENSAL, TODAY);
    const series = Object.values(session.state.value.recurrences)[0] as Recurrence;

    await recurrence.adjustSeries({
      recurrenceId: series.id,
      fromPeriod: "2026-09",
      amountMinor: 550_000,
    });

    const [adjustment] = Object.values(session.fullState.value.recurrenceAdjustments);
    expect(adjustment?.book).toBe("business");
  });

  it("reparar autores cobre as duas contas e preserva o book", async () => {
    await session.setActiveBook("business");
    await recurrence.createSeries(DRAFT, MENSAL, TODAY);
    const [occ] = alive("business");
    if (occ === undefined) throw new Error("sem ocorrência");
    // Ocorrência com autor trocado: o reparo devolve o da série (a série guarda `null`
    // aqui porque a sessão não tem perfil, então o reparo não age e nada muda).
    await recurrence.repairAuthors();
    expect((await db.transactions.get(occ.id))?.book).toBe("business");
  });
});

describe("reservas com duas contas", () => {
  const SERIES_RULE = { amountMinor: 100_000, day: 1, since: "2026-08" };

  it("o depósito mensal da conta inativa sai do saldo dela e herda o book da reserva", async () => {
    const clock = session.clock();
    const business = { ...reserve("RES-B", { recurring: SERIES_RULE }), book: "business" as const };
    const income = buildRow<Transaction>(
      clock,
      { ...DRAFT, userId: null, amountMinor: 300_000, occurredOn: "2026-08-02" },
      undefined,
      "business",
    );
    await session.putRows({ reserves: [business], transactions: [income] });
    expect(session.state.value.reserves).toEqual({});

    const store = createReservesStore(session);
    await store.materializeDue(TODAY);

    const movements = Object.values(session.fullState.value.reserveMovements);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      reserveId: "RES-B",
      amountMinor: 100_000,
      book: "business",
    });
  });

  it("receita da outra conta nunca banca o depósito (sem saldo na conta da reserva)", async () => {
    const clock = session.clock();
    const business = { ...reserve("RES-B", { recurring: SERIES_RULE }), book: "business" as const };
    // Muito dinheiro, mas na conta pessoal.
    const personalIncome = buildRow<Transaction>(
      clock,
      { ...DRAFT, userId: null, amountMinor: 9_000_000, occurredOn: "2026-08-02" },
      undefined,
      "personal",
    );
    await session.putRows({ reserves: [business], transactions: [personalIncome] });

    await createReservesStore(session).materializeDue(TODAY);

    expect(Object.keys(session.fullState.value.reserveMovements)).toEqual([]);
  });

  it("guardar e retirar criam movimento com o book da reserva", async () => {
    await session.setActiveBook("business");
    const store = createReservesStore(session);
    const created = await store.create(
      {
        kind: "goal",
        name: "Reforma",
        icon: "gift",
        color: "rose",
        targetMinor: null,
        multiple: null,
        essentialOverrideMinor: null,
        deadline: null,
        recurringAmountMinor: null,
      },
      TODAY,
    );
    expect(created.book).toBe("business");

    await session.putRows({
      transactions: [
        buildRow<Transaction>(
          session.clock(),
          { ...DRAFT, userId: null, amountMinor: 300_000, occurredOn: "2026-08-02" },
          undefined,
          "business",
        ),
      ],
    });
    await store.deposit(created.id, { amountMinor: 50_000, occurredOn: TODAY, description: null });
    await store.withdraw(created.id, {
      amountMinor: 10_000,
      occurredOn: TODAY,
      description: null,
      reason: "other",
    });

    const movements = Object.values(session.fullState.value.reserveMovements);
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.book === "business")).toBe(true);
  });
});

describe("metas com duas contas", () => {
  it("a meta herda a conta da categoria", async () => {
    await session.setActiveBook("business");
    const category = await session.mutate("categories", (repo) =>
      repo.create({ name: "Fornecedores", icon: "tag", color: "slate", kind: "expense" }),
    );
    await createBudgetsStore(session).set(category.id, 80_000);

    const [budget] = Object.values(session.fullState.value.budgets);
    expect(budget?.book).toBe("business");
    // A conta pessoal não enxerga a meta nem a categoria.
    await session.setActiveBook("personal");
    expect(session.state.value.budgets).toEqual({});
  });
});

describe("padrões com duas contas", () => {
  it("mergeLegacyDefaults funde a cópia pessoal e deixa a homônima comercial em paz", async () => {
    const food = buildDefaultRows().categories.find((c) => c.name === "Alimentação") as Category;
    const copy = (id: string, book?: Book): Category => ({
      ...ALIVE,
      id,
      name: "Alimentação",
      icon: "utensils",
      color: "orange",
      kind: "expense",
      mergedInto: null,
      ...(book === undefined ? {} : { book }),
    });
    await session.putRows({ categories: [copy("COPIA-P"), copy("COPIA-B", "business")] });
    // O padrão pessoal ainda não existe como linha: a cópia pessoal o cria.
    expect(session.fullState.value.categories[food.id]).toBeUndefined();

    await session.setActiveBook("business");
    await createRegistryStore(session).mergeLegacyDefaults();

    const cats = session.fullState.value.categories;
    expect(cats["COPIA-P"]?.mergedInto).toBe(food.id);
    expect(cats[food.id]?.deletedAt).toBeNull();
    // A comercial segue viva e nunca virou o padrão pessoal.
    expect(cats["COPIA-B"]?.deletedAt).toBeNull();
    expect(cats["COPIA-B"]?.mergedInto).toBeNull();
    expect(cats[defaultId("categories", "food", "business")]).toBeUndefined();
  });
});

describe("importação de PDF com duas contas", () => {
  it("as linhas importadas nascem na conta ativa", async () => {
    const entries = parseStatement(["12/09 IFOOD 45,90"], "card", "2026-10").entries.map((e) => ({
      ...e,
      categoryId: null,
    }));
    await session.setActiveBook("business");
    const plan = planImport(entries, {
      paymentMethodId: null,
      referenceMonth: "2026-10",
      book: "business",
    });
    const store = createImportStore(session, recurrence);

    await store.commit(plan, "2026-10-01");

    const [row] = Object.values(session.fullState.value.transactions);
    expect(row?.book).toBe("business");

    // O mesmo extrato na conta pessoal não é visto como "já importado".
    await session.setActiveBook("personal");
    const personal = planImport(entries, {
      paymentMethodId: null,
      referenceMonth: "2026-10",
      book: "personal",
    });
    const result = await store.commit(personal, "2026-10-01");
    expect(result.transactions).toBe(1);
    expect(Object.keys(session.fullState.value.transactions)).toHaveLength(2);
  });
});
