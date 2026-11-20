import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { buildRow } from "../../data/repository";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { budgetIdFor, budgetSeed } from "../../domain/budgets/budget-id";
import { budgetOf, listBudgets } from "../../domain/budgets/list";
import { collidingId } from "../../domain/ids/collision.fake";
import { stableEntityIdV1, stableEntityIdV2 } from "../../domain/ids/stable-id";
import type { Budget } from "../../domain/model/budget";
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

/**
 * Spec do id estável, §4.2/§4.3: A e B são categorias cujas metas colidem no
 * lugar v1. Antes da correção, a meta de B achava a linha de A pelo id e trocava o
 * `categoryId` para B: A perdia a meta.
 */
describe("BudgetsStore com colisão do id estável", () => {
  const CAT_A = "01JZ0000000000000000000CTA";
  const CAT_B = collidingId("01JZ0000000000000000000", CAT_A, budgetSeed);
  const SLOT = stableEntityIdV1(budgetSeed(CAT_A));
  const V2_B = stableEntityIdV2(budgetSeed(CAT_B));

  beforeEach(async () => {
    expect(budgetIdFor(CAT_B)).toBe(SLOT);
    await session.putRows({ categories: [category(CAT_A), category(CAT_B)] });
  });

  it("(e) lugar livre: v1, igual ao de hoje", async () => {
    await store.set(CAT_B, 30_000);

    expect(await db.budgets.get(SLOT)).toMatchObject({ categoryId: CAT_B, limitMinor: 30_000 });
    expect(await db.budgets.count()).toBe(1);
  });

  it("(a) meta de A, depois de B: as duas existem, A com o valor dela", async () => {
    await store.set(CAT_A, 20_000);
    const deA = await db.budgets.get(SLOT);

    await store.set(CAT_B, 30_000);

    expect(await db.budgets.get(SLOT)).toEqual(deA);
    expect(await db.budgets.get(V2_B)).toMatchObject({
      categoryId: CAT_B,
      limitMinor: 30_000,
      deletedAt: null,
      dirty: 1,
    });
    expect(budgetOf(session.state.value, CAT_A)?.limitMinor).toBe(20_000);
    expect(budgetOf(session.state.value, CAT_B)?.limitMinor).toBe(30_000);
  });

  it("(b) meta de A apagada no lugar: B vai para o v2 e o tombstone fica", async () => {
    await store.set(CAT_A, 20_000);
    await store.remove(CAT_A);
    const tombstone = await db.budgets.get(SLOT);
    expect(tombstone?.deletedAt).not.toBeNull();

    await store.set(CAT_B, 30_000);

    expect(await db.budgets.get(SLOT)).toEqual(tombstone);
    expect(await db.budgets.get(V2_B)).toMatchObject({ categoryId: CAT_B, limitMinor: 30_000 });
  });

  it("(c) editar a meta de B atualiza a linha v2", async () => {
    await store.set(CAT_A, 20_000);
    await store.set(CAT_B, 30_000);
    const createdAt = (await db.budgets.get(V2_B))?.createdAt;

    await store.set(CAT_B, 35_000);

    expect(await db.budgets.count()).toBe(2);
    expect(await db.budgets.get(V2_B)).toMatchObject({ limitMinor: 35_000, createdAt });
    expect((await db.budgets.get(SLOT))?.limitMinor).toBe(20_000);
  });

  it("(d) refazer a meta apagada de B revive a mesma linha", async () => {
    await store.set(CAT_A, 20_000);
    await store.set(CAT_B, 30_000);
    await store.remove(CAT_B);

    await store.set(CAT_B, 40_000);

    expect(await db.budgets.count()).toBe(2);
    expect(await db.budgets.get(V2_B)).toMatchObject({ limitMinor: 40_000, deletedAt: null });
  });

  it("lugar com meta da outra conta, que a visão esconde: B vai para o v2", async () => {
    const CAT_C = collidingId("01JZ0000000000000000001", CAT_B, budgetSeed);
    await session.putRows({ categories: [{ ...category(CAT_C), book: "business" }] });
    const deC = buildRow<Budget>(
      session.clock(),
      { categoryId: CAT_C, limitMinor: 1_000 },
      SLOT,
      "business",
    );
    await session.putRows({ budgets: [deC] });
    expect(session.state.value.budgets[SLOT]).toBeUndefined();

    await store.set(CAT_B, 30_000);

    expect(await db.budgets.get(SLOT)).toEqual(deC);
    expect(await db.budgets.get(V2_B)).toMatchObject({ categoryId: CAT_B, limitMinor: 30_000 });
  });
});
