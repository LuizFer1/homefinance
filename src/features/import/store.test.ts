import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { stableEntityIdV1, stableEntityIdV2 } from "../../domain/ids/stable-id";
import { parseStatement } from "../../domain/import/parse";
import {
  classifyImport,
  type ImportContext,
  importSeeds,
  planImport,
} from "../../domain/import/plan";
import { isAlive } from "../../domain/model/base";
import { ALIVE } from "../../domain/model/row.fake";
import { createRecurrenceStore } from "../recurrence/store";
import { createSession, type Session } from "../session/session";
import { createImportStore, type ImportStore } from "./store";

let db: HomeFinanceDb;
let session: Session;
let store: ImportStore;

function planFor(lines: string[], ref: string) {
  const ctx: ImportContext = { paymentMethodId: "CARTAO-1", referenceMonth: ref };
  const entries = parseStatement(lines, "card", ref).entries.map((e) => ({
    ...e,
    categoryId: null,
  }));
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
    // A série guarda o autor: a parcela que nascer noutro aparelho herda dele.
    expect(Object.values(session.state.value.recurrences).map((r) => r.userId)).toEqual([
      "AUTOR-1",
    ]);
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
    const entries = parseStatement(["12/09 ENEL 320,00"], "card", "2026-10").entries.map((e) => ({
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
    const entries = parseStatement(["12/09 ENEL 320,00"], "card", "2026-10").entries.map((e) => ({
      ...e,
      categoryId: "CASA",
      linkTo: confirmada.id,
    }));

    const result = await store.commit(planImport(entries, ctx), "2026-10-01");

    expect(result.confirmed).toBe(0);
    expect((await db.transactions.get(confirmada.id))?.amountMinor).toBe(31_000);
  });
});

describe("reimportação com o lugar do id disputado", () => {
  const ctx: ImportContext = { paymentMethodId: "CARTAO-1", referenceMonth: "2026-10" };
  const lines = ["12/09 IFOOD 45,90", "15/07 LOJA 03/10 150,00"];
  const entries = () =>
    parseStatement(lines, "card", "2026-10").entries.map((e) => ({ ...e, categoryId: null }));
  const slots = () => ({
    transactions: session.fullState.value.transactions,
    recurrences: session.fullState.value.recurrences,
  });

  it("o mesmo PDF duas vezes: a segunda não cria nada", async () => {
    await store.commit(planImport(entries(), ctx, slots()), "2026-10-01");
    const antes = await db.transactions.count();

    expect(classifyImport(entries(), ctx, slots()).map((t) => t.status)).toEqual([
      "imported",
      "imported",
    ]);
    const result = await store.commit(planImport(entries(), ctx, slots()), "2026-10-01");
    expect(result).toEqual({ transactions: 0, series: 0, confirmed: 0 });
    expect(await db.transactions.count()).toBe(antes);
  });

  it("linha com o lugar v1 ocupado por uma ocorrência: marcada, grava em v2 e não volta a ser oferecida", async () => {
    const [seed = ""] = importSeeds(entries(), ctx);
    const slot = stableEntityIdV1(seed);
    await session.putRows({
      transactions: [
        {
          ...ALIVE,
          id: slot,
          kind: "income",
          description: "Salário",
          amountMinor: 500_000,
          currency: "BRL",
          categoryId: null,
          paymentMethodId: null,
          cashbackMinor: null,
          occurredOn: "2026-09-05",
          userId: null,
          recurrenceId: "SERIE",
          occurrenceKey: "SERIE:2026-09",
        },
      ],
    });

    await store.commit(planImport(entries(), ctx, slots()), "2026-10-01");

    const v2 = stableEntityIdV2(seed);
    expect(await db.transactions.get(v2)).toMatchObject({ description: "IFOOD", importKey: v2 });
    expect((await db.transactions.get(slot))?.description).toBe("Salário");
    expect(classifyImport(entries(), ctx, slots())[0]?.status).toBe("imported");
  });
});
