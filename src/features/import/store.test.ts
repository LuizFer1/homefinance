import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { parseStatement } from "../../domain/import/parse";
import { type ImportContext, planImport } from "../../domain/import/plan";
import { isAlive } from "../../domain/model/base";
import { createRecurrenceStore } from "../recurrence/store";
import { createSession, type Session } from "../session/session";
import { createImportStore, type ImportStore } from "./store";

let db: HomeFinanceDb;
let session: Session;
let store: ImportStore;

function planFor(lines: string[], ref: string) {
  const ctx: ImportContext = { paymentMethodId: "CARTAO-1", referenceMonth: ref };
  const entries = parseStatement(lines, "card", ref).map((e) => ({ ...e, categoryId: null }));
  return planImport(entries, ctx);
}

function alive() {
  return Object.values(session.state.value.transactions).filter((t) => isAlive(t));
}

beforeEach(async () => {
  db = openTestDb();
  session = createSession(testSessionDeps(db));
  await session.init();
  session.localUserId.value = "AUTOR-1";
  store = createImportStore(session, createRecurrenceStore(session));
});

afterEach(async () => {
  await db.delete();
});

describe("createImportStore", () => {
  it("grava as avulsas com autor e materializa as parcelas vencidas", async () => {
    const result = await store.commit(
      planFor(["12/09 IFOOD 45,90", "15/07 LOJA 03/10 150,00"], "2026-10"),
      "2026-10-01",
    );

    expect(result).toEqual({ transactions: 4, series: 1, confirmed: 0 });
    expect(
      alive()
        .map((t) => `${t.occurredOn} ${t.description}`)
        .sort(),
    ).toEqual([
      "2026-07-15 LOJA (10x)",
      "2026-08-15 LOJA (10x)",
      "2026-09-12 IFOOD",
      "2026-09-15 LOJA (10x)",
    ]);
    expect(alive().every((t) => t.userId === "AUTOR-1")).toBe(true);
  });

  it("reimportar o mesmo PDF não duplica", async () => {
    const plan = planFor(["12/09 IFOOD 45,90", "15/07 LOJA 03/10 150,00"], "2026-10");
    await store.commit(plan, "2026-10-01");
    const again = await store.commit(plan, "2026-10-01");

    expect(again).toEqual({ transactions: 0, series: 0, confirmed: 0 });
    expect(await db.transactions.count()).toBe(4);
    expect(await db.recurrences.count()).toBe(1);
  });

  it("a fatura seguinte reaproveita a série da parcela", async () => {
    await store.commit(planFor(["15/07 LOJA 03/10 150,00"], "2026-10"), "2026-10-01");
    await store.commit(planFor(["15/07 LOJA 04/10 150,00"], "2026-11"), "2026-11-01");

    expect(await db.recurrences.count()).toBe(1);
    expect(alive()).toHaveLength(4);
  });

  it("linha apagada não volta ao reimportar", async () => {
    const plan = planFor(["12/09 IFOOD 45,90"], "2026-10");
    await store.commit(plan, "2026-10-01");
    const [row] = alive();
    if (row === undefined) throw new Error("sem linha");
    await session.mutate("transactions", (repo) => repo.remove(row.id));

    await store.commit(plan, "2026-10-01");
    expect(alive()).toHaveLength(0);
  });

  it("linha vinculada confirma a estimativa, e reimportar não duplica nem regrava", async () => {
    const estimada = await session.mutate("transactions", (repo) =>
      repo.create({
        kind: "expense",
        description: "Conta de luz",
        amountMinor: 20_000,
        currency: "BRL",
        categoryId: "CASA",
        paymentMethodId: null,
        cashbackMinor: null,
        occurredOn: "2026-09-10",
        userId: null,
        recurrenceId: "SERIE",
        occurrenceKey: "SERIE:2026-09",
        estimated: true,
      }),
    );
    const ctx: ImportContext = { paymentMethodId: "CARTAO-1", referenceMonth: "2026-10" };
    const entries = parseStatement(["12/09 ENEL 320,00"], "card", "2026-10").map((e) => ({
      ...e,
      categoryId: "CASA",
      linkTo: estimada.id,
    }));
    const plan = planImport(entries, ctx);

    expect(await store.commit(plan, "2026-10-01")).toEqual({
      transactions: 0,
      series: 0,
      confirmed: 1,
    });
    const depois = await db.transactions.get(estimada.id);
    expect(depois).toMatchObject({
      amountMinor: 32_000,
      occurredOn: "2026-09-12",
      estimated: false,
      importKey: plan.confirmations[0]?.importKey,
      description: "Conta de luz",
    });

    await session.mutate("transactions", (repo) =>
      repo.update(estimada.id, { amountMinor: 31_000 }),
    );
    expect(await store.commit(plan, "2026-10-01")).toEqual({
      transactions: 0,
      series: 0,
      confirmed: 0,
    });
    expect(await db.transactions.count()).toBe(1);
    expect((await db.transactions.get(estimada.id))?.amountMinor).toBe(31_000);
  });

  it("estimativa já confirmada à mão não é sobrescrita pelo PDF", async () => {
    const confirmada = await session.mutate("transactions", (repo) =>
      repo.create({
        kind: "expense",
        description: "Conta de luz",
        amountMinor: 31_000,
        currency: "BRL",
        categoryId: "CASA",
        paymentMethodId: null,
        cashbackMinor: null,
        occurredOn: "2026-09-10",
        userId: null,
        recurrenceId: "SERIE",
        occurrenceKey: "SERIE:2026-09",
        estimated: false,
      }),
    );
    const ctx: ImportContext = { paymentMethodId: "CARTAO-1", referenceMonth: "2026-10" };
    const entries = parseStatement(["12/09 ENEL 320,00"], "card", "2026-10").map((e) => ({
      ...e,
      categoryId: "CASA",
      linkTo: confirmada.id,
    }));

    const result = await store.commit(planImport(entries, ctx), "2026-10-01");

    expect(result.confirmed).toBe(0);
    expect((await db.transactions.get(confirmada.id))?.amountMinor).toBe(31_000);
  });
});
