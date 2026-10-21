import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { budgetIdFor } from "../../domain/budgets/budget-id";
import { listBudgets } from "../../domain/budgets/list";
import type { Category } from "../../domain/model/category";
import { ALIVE } from "../../domain/model/row.fake";
import { MAX_MINOR } from "../../domain/money/mask";
import { createSession, type Session } from "../session/session";
import { type BudgetsStore, createBudgetsStore } from "./store";

const FOOD = "01J9F3K2M7QX8YB4TVWZ0DCEF1";
const FUN = "01J9F3K2M7QX8YB4TVWZ0DCEF2";

const category = (id: string): Category => ({
  ...ALIVE,
  id,
  name: id,
  icon: "tag",
  color: "sky",
  kind: "expense",
});

let db: HomeFinanceDb;
let session: Session;
let store: BudgetsStore;

beforeEach(async () => {
  db = openTestDb();
  session = createSession(testSessionDeps(db));
  await session.init();
  await session.putRows({ categories: [category(FOOD), category(FUN)] }, { localUserId: "U1" });
  store = createBudgetsStore(session);
});

afterEach(async () => {
  await db.delete();
});

describe("BudgetsStore", () => {
  it("cria a meta com o id derivado da categoria e persiste no banco", async () => {
    await store.set(FOOD, 60_000);

    const row = await db.budgets.get(budgetIdFor(FOOD));
    expect(row).toMatchObject({ categoryId: FOOD, limitMinor: 60_000, deletedAt: null, dirty: 1 });
    expect(listBudgets(session.state.value)).toHaveLength(1);
  });

  it("editar a meta reaproveita a mesma linha", async () => {
    await store.set(FOOD, 60_000);
    await store.set(FOOD, 80_000);

    expect(await db.budgets.count()).toBe(1);
    expect(listBudgets(session.state.value)[0]?.limitMinor).toBe(80_000);
  });

  it("apagar e refazer revive a mesma linha, sem derrubar o lote", async () => {
    await store.set(FOOD, 60_000);
    await store.remove(FOOD);
    expect(listBudgets(session.state.value)).toEqual([]);
    expect((await db.budgets.get(budgetIdFor(FOOD)))?.deletedAt).not.toBeNull();

    await store.set(FOOD, 70_000);
    expect(await db.budgets.count()).toBe(1);
    expect(listBudgets(session.state.value)[0]).toMatchObject({
      limitMinor: 70_000,
      deletedAt: null,
    });
  });

  it("sobrevive a recarregar a sessão", async () => {
    await store.set(FOOD, 60_000);
    await store.set(FUN, 10_000);

    const reopened = createSession(testSessionDeps(db));
    await reopened.init();
    expect(
      listBudgets(reopened.state.value)
        .map((b) => [b.categoryId, b.limitMinor])
        .sort(),
    ).toEqual([
      [FOOD, 60_000],
      [FUN, 10_000],
    ]);
  });

  it("apagar sem meta não faz nada", async () => {
    await store.remove(FOOD);
    expect(await db.budgets.count()).toBe(0);
  });

  it.each([0, -5, 12.5, MAX_MINOR + 1, Number.NaN])("recusa o valor %s", async (value) => {
    await expect(store.set(FOOD, value)).rejects.toThrow("Valor da meta inválido");
    expect(session.error.value).toBe("Valor da meta inválido");
    expect(await db.budgets.count()).toBe(0);
  });

  it("recusa categoria que não existe", async () => {
    await expect(store.set("NAO-EXISTE", 1_000)).rejects.toThrow("Categoria não existe");
  });

  it("apagar a categoria esconde a meta e não a apaga", async () => {
    await store.set(FOOD, 60_000);
    const food = session.state.value.categories[FOOD];
    if (food === undefined) throw new Error("categoria sumiu");
    await session.putRows({
      categories: [{ ...food, deletedAt: session.clock().stamp().hlc, dirty: 1 }],
    });

    expect(listBudgets(session.state.value)).toEqual([]);
    expect((await db.budgets.get(budgetIdFor(FOOD)))?.deletedAt).toBeNull();
  });

  it("outra aba mudou a meta depois do boot: a escrita é recusada", async () => {
    await store.set(FOOD, 60_000);
    const other = createSession(testSessionDeps(db));
    await other.init();
    await createBudgetsStore(other).set(FOOD, 99_000);

    await expect(store.set(FOOD, 70_000)).rejects.toThrow("mudaram em outra aba");
    expect((await db.budgets.get(budgetIdFor(FOOD)))?.limitMinor).toBe(99_000);
  });
});
