import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { floorHlc } from "../../domain/clock/hlc";
import { stableEntityId } from "../../domain/ids/stable-id";
import { isAlive } from "../../domain/model/base";
import type { Recurrence, RecurrenceDraft, RecurrenceRule } from "../../domain/model/recurrence";
import type { TransactionDraft } from "../../domain/model/transaction";
import { MAX_MINOR } from "../../domain/money/mask";
import { adjustmentId } from "../../domain/recurrence/adjustments";
import { occurrenceKey } from "../../domain/recurrence/schedule";
import { createSession, type Session, StaleRowsError } from "../session/session";
import { createRecurrenceStore, type RecurrenceStore } from "./store";

const DRAFT: TransactionDraft = {
  kind: "income",
  description: "Salário",
  amountMinor: 500_000,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-06-05",
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
let store: RecurrenceStore;

function alive() {
  return Object.values(session.state.value.transactions).filter((t) => isAlive(t));
}

/** Só os campos de `RecurrenceDraft` — evita destructuring com variáveis não usadas. */
function draftOf(row: Recurrence): RecurrenceDraft {
  return {
    kind: row.kind,
    description: row.description,
    amountMinor: row.amountMinor,
    currency: row.currency,
    categoryId: row.categoryId,
    paymentMethodId: row.paymentMethodId,
    cashbackMinor: row.cashbackMinor,
    frequency: row.frequency,
    scheduleType: row.scheduleType,
    scheduleN: row.scheduleN,
    startOn: row.startOn,
    endOn: row.endOn,
    active: row.active,
  };
}

/**
 * A série que `createSeries(DRAFT, MENSAL, ...)` gravaria, montada à mão para
 * os testes que precisam dela no banco **sem** materializar nada ainda.
 */
function mensalDraft(): RecurrenceDraft {
  return {
    kind: DRAFT.kind,
    description: DRAFT.description,
    amountMinor: DRAFT.amountMinor,
    currency: "BRL",
    categoryId: DRAFT.categoryId,
    paymentMethodId: DRAFT.paymentMethodId,
    cashbackMinor: DRAFT.cashbackMinor,
    frequency: MENSAL.frequency,
    scheduleType: MENSAL.scheduleType,
    scheduleN: MENSAL.scheduleN,
    startOn: DRAFT.occurredOn,
    endOn: MENSAL.endOn,
    active: true,
  };
}

function onlySeries(): Recurrence {
  const [series] = Object.values(session.state.value.recurrences);
  if (series === undefined) throw new Error("nenhuma série no estado");
  return series;
}

function amountOf(seriesId: string, period: string): number | undefined {
  return session.state.value.transactions[stableEntityId(occurrenceKey(seriesId, period))]
    ?.amountMinor;
}

beforeEach(async () => {
  db = openTestDb();
  session = createSession(testSessionDeps(db));
  await session.init();
  session.localUserId.value = "AUTOR-1";
  store = createRecurrenceStore(session);
});

afterEach(async () => {
  await db.delete();
});

describe("createRecurrenceStore", () => {
  it("createSeries grava a série e materializa até hoje", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");

    expect(Object.values(session.state.value.recurrences)).toHaveLength(1);
    expect(
      alive()
        .map((t) => t.occurredOn)
        .sort(),
    ).toEqual(["2026-06-05", "2026-07-05", "2026-08-05"]);
    expect(alive().every((t) => t.userId === "AUTOR-1")).toBe(true);
    expect(await db.transactions.count()).toBe(3);
  });

  it("materializeDue repetido não duplica nem atualiza as linhas existentes", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const antes = alive()
      .map((t) => ({ id: t.id, updatedAt: t.updatedAt }))
      .sort((a, b) => a.id.localeCompare(b.id));

    await store.materializeDue("2026-08-10");

    // `insertMissing` não regrava quem já existe: se regravasse, `updatedAt`
    // teria avançado mesmo sem mudança nenhuma de conteúdo.
    const depois = alive()
      .map((t) => ({ id: t.id, updatedAt: t.updatedAt }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(depois).toEqual(antes);
    expect(await db.transactions.count()).toBe(3);
  });

  it("não recria ocorrência apagada", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const junho = alive().find((t) => t.occurredOn === "2026-06-05");
    if (junho === undefined) throw new Error("junho não materializado");
    await session.mutate("transactions", (repo) => repo.remove(junho.id));

    await store.materializeDue("2026-08-10");

    expect(session.state.value.transactions[junho.id]?.deletedAt).not.toBeNull();
    expect((await db.transactions.get(junho.id))?.deletedAt).not.toBeNull();
    expect(alive()).toHaveLength(2);
  });

  it("série pausada não gera novas ocorrências", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-06-10");
    const [serie] = Object.values(session.state.value.recurrences);
    if (serie === undefined) throw new Error("série não criada");
    await store.editSeries(serie.id, { ...draftOf(serie), active: false });

    await store.materializeDue("2026-09-10");
    expect(alive()).toHaveLength(1);
    expect(await db.transactions.count()).toBe(1);
  });

  it("removeSeries marca deletedAt e mantém o histórico", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-07-10");
    const [serie] = Object.values(session.state.value.recurrences);
    if (serie === undefined) throw new Error("série não criada");

    await store.removeSeries(serie.id);

    expect(session.state.value.recurrences[serie.id]?.deletedAt).not.toBeNull();
    expect((await db.recurrences.get(serie.id))?.deletedAt).not.toBeNull();
    expect(alive()).toHaveLength(2);
  });

  it("materializeDue antes do init preenche session.error (M3)", async () => {
    const cru = createSession(testSessionDeps(db));
    const storeCru = createRecurrenceStore(cru);
    // Sem `init()`: `clock()` lança "Sessão não inicializada" dentro de
    // `materializeDue`, que precisa preencher `error` como qualquer outra
    // falha de escrita — não só relançar.
    const seriesDraft = mensalDraft();
    // Precisa de uma série pendente no `state` para `materializeDue` chegar
    // até o `clock()` — sem plano, a função retorna cedo.
    const withSeries = await session.mutate("recurrences", (repo) => repo.create(seriesDraft));
    cru.state.value = { ...cru.state.value, recurrences: { [withSeries.id]: withSeries } };

    await expect(storeCru.materializeDue("2026-08-10")).rejects.toThrow("Sessão não inicializada");
    expect(cru.error.value).toBe("Sessão não inicializada");
  });

  it("falha ao criar a série rejeita e não materializa", async () => {
    vi.spyOn(db.recurrences, "put").mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(store.createSeries(DRAFT, MENSAL, "2026-08-10")).rejects.toThrow();
    expect(await db.transactions.count()).toBe(0);
  });

  it("sessão desatualizada não revive ocorrência apagada por outra sessão (I1)", async () => {
    const seriesDraft = mensalDraft();
    // A série existe, mas ainda sem nenhuma ocorrência materializada.
    await session.mutate("recurrences", (repo) => repo.create(seriesDraft));

    // A sessão B nasce agora: sabe da série, mas seu `state.transactions`
    // fica vazio para sempre — nada nesta suíte a atualiza depois do boot.
    const sessionB = createSession(testSessionDeps(db));
    await sessionB.init();
    const storeB = createRecurrenceStore(sessionB);

    // A sessão original (A) materializa e depois apaga a competência de junho.
    await store.materializeDue("2026-08-10");
    const junho = alive().find((t) => t.occurredOn === "2026-06-05");
    if (junho === undefined) throw new Error("junho não materializado");
    await session.mutate("transactions", (repo) => repo.remove(junho.id));

    // B, sem saber de nada disso, tenta materializar de novo. Sem
    // `insertMissing`, isto sobrescreveria a linha apagada com uma nova.
    await storeB.materializeDue("2026-08-10");

    expect((await db.transactions.get(junho.id))?.deletedAt).not.toBeNull();
    expect(await db.transactions.count()).toBe(3);
  });
});

describe("adjustSeries", () => {
  it("reajuste futuro grava o reajuste, não toca o extrato e vale na materialização", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();

    await store.adjustSeries({
      recurrenceId: series.id,
      fromPeriod: "2026-09",
      amountMinor: 550_000,
    });

    const id = adjustmentId(series.id, "2026-09");
    expect(session.state.value.recurrenceAdjustments[id]).toMatchObject({ amountMinor: 550_000 });
    expect(await db.recurrenceAdjustments.get(id)).toMatchObject({ amountMinor: 550_000 });
    expect(alive().every((t) => t.amountMinor === 500_000)).toBe(true);

    await store.materializeDue("2026-09-10");
    expect(amountOf(series.id, "2026-09")).toBe(550_000);
  });

  it("retroativo atualiza as lançadas e mantém a editada à mão", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    const agosto = stableEntityId(occurrenceKey(series.id, "2026-08"));
    await session.mutate("transactions", (repo) => repo.update(agosto, { amountMinor: 520_000 }));

    await store.adjustSeries({
      recurrenceId: series.id,
      fromPeriod: "2026-07",
      amountMinor: 550_000,
    });

    expect(amountOf(series.id, "2026-06")).toBe(500_000);
    expect(amountOf(series.id, "2026-07")).toBe(550_000);
    expect(amountOf(series.id, "2026-08")).toBe(520_000);
    const julho = await db.transactions.get(stableEntityId(occurrenceKey(series.id, "2026-07")));
    expect(julho).toMatchObject({ amountMinor: 550_000, dirty: 1 });
  });

  it("falha na gravação não deixa reajuste nem ocorrência alterada", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    // Falha a SEGUNDA gravação do lote: `putRowsIfCurrent` grava na ordem de TABLE_NAMES
    // (transactions antes de recurrenceAdjustments), então a ocorrência de julho
    // já foi gravada quando o reajuste falha — é isso que prova o rollback. Se a
    // ordem mudar, este teste deixa de provar a atomicidade.
    vi.spyOn(db.recurrenceAdjustments, "bulkPut").mockRejectedValueOnce(
      new Error("quota exceeded"),
    );

    await expect(
      store.adjustSeries({ recurrenceId: series.id, fromPeriod: "2026-07", amountMinor: 550_000 }),
    ).rejects.toThrow("quota exceeded");

    expect(session.error.value).toBe("quota exceeded");
    expect(amountOf(series.id, "2026-07")).toBe(500_000);
    const julho = await db.transactions.get(stableEntityId(occurrenceKey(series.id, "2026-07")));
    expect(julho?.amountMinor).toBe(500_000);
    expect(await db.recurrenceAdjustments.count()).toBe(0);
  });

  it.each([0, 1.5, MAX_MINOR + 1])("valor %s rejeita e não grava nada", async (amountMinor) => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();

    await expect(
      store.adjustSeries({ recurrenceId: series.id, fromPeriod: "2026-07", amountMinor }),
    ).rejects.toThrow("Valor de reajuste inválido");

    expect(session.error.value).toBe("Valor de reajuste inválido");
    expect(await db.recurrenceAdjustments.count()).toBe(0);
    const julho = await db.transactions.get(stableEntityId(occurrenceKey(series.id, "2026-07")));
    expect(julho?.amountMinor).toBe(500_000);
  });

  it("sessão desatualizada não revive ocorrência apagada por outra sessão", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    const julho = stableEntityId(occurrenceKey(series.id, "2026-07"));

    // A sessão B nasce depois da materialização e apaga julho; a sessão A
    // continua com julho vivo no `state` em memória.
    const sessionB = createSession(testSessionDeps(db));
    await sessionB.init();
    await sessionB.mutate("transactions", (repo) => repo.remove(julho));

    await expect(
      store.adjustSeries({ recurrenceId: series.id, fromPeriod: "2026-07", amountMinor: 550_000 }),
    ).rejects.toBeInstanceOf(StaleRowsError);

    expect((await db.transactions.get(julho))?.deletedAt).not.toBeNull();
    expect((await db.transactions.get(julho))?.amountMinor).toBe(500_000);
    expect(await db.recurrenceAdjustments.count()).toBe(0);
    // A tela de A passa a ver o que o banco tem, para o próximo reajuste já
    // planejar sem julho.
    expect(session.state.value.transactions[julho]?.deletedAt).not.toBeNull();
  });

  it("série inexistente rejeita e preenche error", async () => {
    await expect(
      store.adjustSeries({ recurrenceId: "NADA", fromPeriod: "2026-07", amountMinor: 1 }),
    ).rejects.toThrow("Série não existe");
    expect(session.error.value).toBe("Série não existe");
  });

  it("refazer o reajuste da mesma competência reaproveita a linha, inclusive apagada", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    const id = adjustmentId(series.id, "2026-09");
    await store.adjustSeries({
      recurrenceId: series.id,
      fromPeriod: "2026-09",
      amountMinor: 550_000,
    });
    const createdAt = session.state.value.recurrenceAdjustments[id]?.createdAt;
    await store.removeAdjustment(id);

    await store.adjustSeries({
      recurrenceId: series.id,
      fromPeriod: "2026-09",
      amountMinor: 600_000,
    });

    expect(await db.recurrenceAdjustments.count()).toBe(1);
    expect(session.state.value.recurrenceAdjustments[id]).toMatchObject({
      amountMinor: 600_000,
      deletedAt: null,
      createdAt,
    });
    expect(await db.recurrenceAdjustments.get(id)).toMatchObject({
      amountMinor: 600_000,
      deletedAt: null,
      createdAt,
    });
    await store.materializeDue("2026-09-10");
    expect(amountOf(series.id, "2026-09")).toBe(600_000);
  });

  it("removeAdjustment apaga o reajuste e a série volta ao valor anterior", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    await store.adjustSeries({
      recurrenceId: series.id,
      fromPeriod: "2026-09",
      amountMinor: 550_000,
    });

    const removed = await store.removeAdjustment(adjustmentId(series.id, "2026-09"));

    expect(removed.deletedAt).not.toBeNull();
    await store.materializeDue("2026-09-10");
    expect(amountOf(series.id, "2026-09")).toBe(500_000);
  });
});

describe("série variável", () => {
  const VARIAVEL: RecurrenceRule = { ...MENSAL, variable: true };
  const LUZ: TransactionDraft = {
    ...DRAFT,
    kind: "expense",
    description: "Luz",
    amountMinor: 20_000,
  };

  it("createSeries grava a série variável e as ocorrências estimadas, ancoradas", async () => {
    await store.createSeries(LUZ, VARIAVEL, "2026-07-10");

    const series = onlySeries();
    expect(series.variable).toBe(true);
    const junho =
      session.state.value.transactions[stableEntityId(occurrenceKey(series.id, "2026-06"))];
    expect(junho).toMatchObject({ amountMinor: 20_000, estimated: true });
    expect(junho?.updatedAt).toBe(floorHlc("2026-06-05", session.clock().deviceId));
    expect((await db.transactions.get(junho?.id ?? ""))?.updatedAt).toBe(junho?.updatedAt);
  });

  it("a próxima ocorrência nasce com a média das confirmadas", async () => {
    await store.createSeries(LUZ, VARIAVEL, "2026-06-10");
    const series = onlySeries();
    const junho = stableEntityId(occurrenceKey(series.id, "2026-06"));
    await session.mutate("transactions", (repo) =>
      repo.update(junho, { amountMinor: 32_000, estimated: false }),
    );

    await store.materializeDue("2026-07-10");

    expect(amountOf(series.id, "2026-07")).toBe(32_000);
  });

  it("série fixa continua sem a coluna `variable` e sem âncora", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-06-10");

    expect(onlySeries()).not.toHaveProperty("variable");
    expect(alive()[0]).not.toHaveProperty("estimated");
  });

  it("makeVariable converte sem reescrever as ocorrências lançadas", async () => {
    await store.createSeries({ ...LUZ, amountMinor: 18_000 }, MENSAL, "2026-07-10");
    const series = onlySeries();
    const antes = alive().map((t) => t.updatedAt);

    await store.makeVariable(series.id);
    await store.materializeDue("2026-08-10");

    expect(session.state.value.recurrences[series.id]?.variable).toBe(true);
    expect(amountOf(series.id, "2026-08")).toBe(18_000);
    expect(
      alive()
        .filter((t) => t.occurredOn < "2026-08-01")
        .map((t) => t.updatedAt),
    ).toEqual(antes);
  });

  it("adjustSeries recusa série variável", async () => {
    await store.createSeries(LUZ, VARIAVEL, "2026-06-10");

    await expect(
      store.adjustSeries({ recurrenceId: onlySeries().id, fromPeriod: "2026-07", amountMinor: 1 }),
    ).rejects.toThrow(/variável/);
    expect(await db.recurrenceAdjustments.count()).toBe(0);
  });
});
