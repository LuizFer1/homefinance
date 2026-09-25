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

    expect(result).toEqual({ transactions: 4, series: 1 });
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

    expect(again).toEqual({ transactions: 0, series: 0 });
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
});
