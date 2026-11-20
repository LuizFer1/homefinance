import type { Signal } from "@preact/signals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { buildRow } from "../../data/repository";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { floorHlc } from "../../domain/clock/hlc";
import { collidingId } from "../../domain/ids/collision.fake";
import { stableEntityIdV1, stableEntityIdV2 } from "../../domain/ids/stable-id";
import type { AppState } from "../../domain/model/app-state";
import { isAlive } from "../../domain/model/base";
import type { Recurrence, RecurrenceDraft, RecurrenceRule } from "../../domain/model/recurrence";
import type { RecurrenceAdjustment } from "../../domain/model/recurrence-adjustment";
import type { ReserveMovement } from "../../domain/model/reserve";
import type { Transaction, TransactionDraft } from "../../domain/model/transaction";
import { MAX_MINOR } from "../../domain/money/mask";
import { adjustmentId, adjustmentSeed } from "../../domain/recurrence/adjustments";
import { recoveryCandidates } from "../../domain/recurrence/recovery";
import { occurrenceKey } from "../../domain/recurrence/schedule";
import { depositSeed } from "../../domain/reserves/deposits";
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
  return session.state.value.transactions[stableEntityIdV1(occurrenceKey(seriesId, period))]
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
    // `fullState` é só leitura na interface; o teste planta a série no estado de uma
    // sessão sem `init` para `materializeDue` chegar até o `clock()`.
    (cru.fullState as Signal<AppState>).value = {
      ...cru.fullState.value,
      recurrences: { [withSeries.id]: withSeries },
    };

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
    const agosto = stableEntityIdV1(occurrenceKey(series.id, "2026-08"));
    await session.mutate("transactions", (repo) => repo.update(agosto, { amountMinor: 520_000 }));

    await store.adjustSeries({
      recurrenceId: series.id,
      fromPeriod: "2026-07",
      amountMinor: 550_000,
    });

    expect(amountOf(series.id, "2026-06")).toBe(500_000);
    expect(amountOf(series.id, "2026-07")).toBe(550_000);
    expect(amountOf(series.id, "2026-08")).toBe(520_000);
    const julho = await db.transactions.get(stableEntityIdV1(occurrenceKey(series.id, "2026-07")));
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
    const julho = await db.transactions.get(stableEntityIdV1(occurrenceKey(series.id, "2026-07")));
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
    const julho = await db.transactions.get(stableEntityIdV1(occurrenceKey(series.id, "2026-07")));
    expect(julho?.amountMinor).toBe(500_000);
  });

  it("sessão desatualizada não revive ocorrência apagada por outra sessão", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    const julho = stableEntityIdV1(occurrenceKey(series.id, "2026-07"));

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

/**
 * Spec do id estável, §4.2/§4.3: A e B são séries cujas sementes de reajuste em
 * setembro colidem na v1, o mesmo lugar. Antes da correção, reajustar B achava a
 * linha de A pelo id e trocava o valor **de A**, para sempre.
 */
describe("adjustSeries com colisão do id estável", () => {
  const SERIE_A = "01JZ0000000000000000000SRA";
  const seedOf = (series: string) => adjustmentSeed(series, "2026-09");
  const SERIE_B = collidingId("01JZ0000000000000000000", SERIE_A, seedOf);
  const SLOT = stableEntityIdV1(seedOf(SERIE_A));
  const V2_B = stableEntityIdV2(seedOf(SERIE_B));

  /** Série gravada direto, com id escolhido. */
  async function serie(id: string, over: Partial<RecurrenceDraft> = {}, book?: "business") {
    const row = buildRow<Recurrence>(
      session.clock(),
      { ...mensalDraft(), userId: "AUTOR-1", ...over },
      id,
      book,
    );
    await session.putRows({ recurrences: [row] });
    return row;
  }

  const reajustar = (recurrenceId: string, amountMinor: number) =>
    store.adjustSeries({ recurrenceId, fromPeriod: "2026-09", amountMinor });

  const linha = (id: string): RecurrenceAdjustment | undefined =>
    session.fullState.value.recurrenceAdjustments[id];

  beforeEach(async () => {
    expect(adjustmentId(SERIE_B, "2026-09")).toBe(SLOT);
    // A começa longe: não materializa nada que dispute lugar com as ocorrências de B.
    await serie(SERIE_A, { startOn: "2030-01-05" });
    await serie(SERIE_B);
  });

  it("(e) lugar livre: B vai para o v1, igual ao app de hoje", async () => {
    await reajustar(SERIE_B, 550_000);

    expect(await db.recurrenceAdjustments.count()).toBe(1);
    expect(await db.recurrenceAdjustments.get(SLOT)).toMatchObject({
      recurrenceId: SERIE_B,
      amountMinor: 550_000,
    });
  });

  it("(a) lugar com o reajuste vivo de A: B vai para o v2 e A fica intacto", async () => {
    await reajustar(SERIE_A, 350_000);
    const deA = await db.recurrenceAdjustments.get(SLOT);

    await reajustar(SERIE_B, 550_000);

    expect(await db.recurrenceAdjustments.get(SLOT)).toEqual(deA);
    expect(await db.recurrenceAdjustments.get(V2_B)).toMatchObject({
      recurrenceId: SERIE_B,
      fromPeriod: "2026-09",
      amountMinor: 550_000,
      deletedAt: null,
      dirty: 1,
    });
    expect(linha(SLOT)).toEqual(deA);
  });

  it("(b) lugar com o reajuste apagado de A: B vai para o v2 e o tombstone fica", async () => {
    await reajustar(SERIE_A, 350_000);
    await store.removeAdjustment(SLOT);
    const tombstone = await db.recurrenceAdjustments.get(SLOT);
    expect(tombstone?.deletedAt).not.toBeNull();

    await reajustar(SERIE_B, 550_000);

    expect(await db.recurrenceAdjustments.get(SLOT)).toEqual(tombstone);
    expect(await db.recurrenceAdjustments.get(V2_B)).toMatchObject({ amountMinor: 550_000 });
  });

  it("(c) reajustar B de novo atualiza a linha v2 de B, pela chave", async () => {
    await reajustar(SERIE_A, 350_000);
    await reajustar(SERIE_B, 550_000);
    const createdAt = linha(V2_B)?.createdAt;

    await reajustar(SERIE_B, 600_000);

    expect(await db.recurrenceAdjustments.count()).toBe(2);
    expect(await db.recurrenceAdjustments.get(V2_B)).toMatchObject({
      amountMinor: 600_000,
      createdAt,
    });
    expect((await db.recurrenceAdjustments.get(SLOT))?.amountMinor).toBe(350_000);
  });

  it("(d) reajuste apagado de B na competência é revivido, não criado outro", async () => {
    await reajustar(SERIE_A, 350_000);
    await reajustar(SERIE_B, 550_000);
    await store.removeAdjustment(V2_B);

    await reajustar(SERIE_B, 600_000);

    expect(await db.recurrenceAdjustments.count()).toBe(2);
    expect(await db.recurrenceAdjustments.get(V2_B)).toMatchObject({
      amountMinor: 600_000,
      deletedAt: null,
    });
  });

  it("(f) Este e os próximos, com valor, passa pelo mesmo caminho", async () => {
    await reajustar(SERIE_A, 350_000);
    const deA = await db.recurrenceAdjustments.get(SLOT);
    await store.materializeDue("2026-09-10");
    const setembro =
      session.state.value.transactions[stableEntityIdV1(occurrenceKey(SERIE_B, "2026-09"))];
    if (setembro === undefined) throw new Error("setembro de B não materializou");

    await store.editFollowing(setembro.id, {
      kind: setembro.kind,
      description: setembro.description,
      amountMinor: 560_000,
      currency: "BRL",
      categoryId: setembro.categoryId,
      paymentMethodId: setembro.paymentMethodId,
      cashbackMinor: setembro.cashbackMinor,
      occurredOn: setembro.occurredOn,
      recurrenceId: setembro.recurrenceId,
      occurrenceKey: setembro.occurrenceKey,
    });

    expect(await db.recurrenceAdjustments.get(SLOT)).toEqual(deA);
    expect(await db.recurrenceAdjustments.get(V2_B)).toMatchObject({
      recurrenceId: SERIE_B,
      amountMinor: 560_000,
    });
  });

  it("lugar com reajuste da outra conta, que a visão esconde: B vai para o v2", async () => {
    // Série C e o reajuste dela moram na conta comercial; a tela está na pessoal.
    const SERIE_C = collidingId("01JZ0000000000000000001", SERIE_B, seedOf);
    await serie(SERIE_C, { startOn: "2030-01-05" }, "business");
    const deC = buildRow<RecurrenceAdjustment>(
      session.clock(),
      { recurrenceId: SERIE_C, fromPeriod: "2026-09", amountMinor: 1_000 },
      SLOT,
      "business",
    );
    await session.putRows({ recurrenceAdjustments: [deC] });
    expect(session.state.value.recurrenceAdjustments[SLOT]).toBeUndefined();

    await reajustar(SERIE_B, 550_000);

    expect(await db.recurrenceAdjustments.get(SLOT)).toEqual(deC);
    expect(await db.recurrenceAdjustments.get(V2_B)).toMatchObject({
      recurrenceId: SERIE_B,
      amountMinor: 550_000,
    });
  });

  it("removeAdjustment apaga todas as linhas vivas da competência, não só a mostrada", async () => {
    // Duplicata da chave (aparelho velho num id, novo noutro): a tela mostra uma
    // só, e apagar só ela faria a outra reaparecer valendo.
    await reajustar(SERIE_A, 350_000);
    await reajustar(SERIE_B, 550_000);
    const duplicata = buildRow<RecurrenceAdjustment>(
      session.clock(),
      { recurrenceId: SERIE_B, fromPeriod: "2026-09", amountMinor: 540_000 },
      "01JZ000000000000000000DUPB",
    );
    await session.putRows({ recurrenceAdjustments: [duplicata] });

    const removed = await store.removeAdjustment(duplicata.id);

    expect(removed).toMatchObject({ id: duplicata.id, dirty: 1 });
    expect(removed.deletedAt).not.toBeNull();
    expect((await db.recurrenceAdjustments.get(duplicata.id))?.deletedAt).not.toBeNull();
    expect((await db.recurrenceAdjustments.get(V2_B))?.deletedAt).not.toBeNull();
    // O reajuste de A só divide o lugar v1, não é da chave: fica.
    expect((await db.recurrenceAdjustments.get(SLOT))?.deletedAt).toBeNull();
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
      session.state.value.transactions[stableEntityIdV1(occurrenceKey(series.id, "2026-06"))];
    expect(junho).toMatchObject({ amountMinor: 20_000, estimated: true });
    expect(junho?.updatedAt).toBe(floorHlc("2026-06-05", session.clock().deviceId));
    expect((await db.transactions.get(junho?.id ?? ""))?.updatedAt).toBe(junho?.updatedAt);
  });

  it("a próxima ocorrência nasce com a média das confirmadas", async () => {
    await store.createSeries(LUZ, VARIAVEL, "2026-06-10");
    const series = onlySeries();
    const junho = stableEntityIdV1(occurrenceKey(series.id, "2026-06"));
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

describe("parcelamento", () => {
  const COMPRA: TransactionDraft = {
    ...DRAFT,
    kind: "expense",
    description: "Geladeira",
    amountMinor: 10_000,
    occurredOn: "2026-06-15",
  };

  it("divide o total, põe a sobra na 1ª parcela e termina na última", async () => {
    await store.createSeries(COMPRA, { ...MENSAL, installments: 3 }, "2026-12-01");

    const serie = onlySeries();
    expect(serie).toMatchObject({
      description: "Geladeira (3x)",
      amountMinor: 3_333,
      firstAmountMinor: 3_334,
      userId: "AUTOR-1",
    });
    expect(
      alive()
        .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
        .map((t) => [t.occurredOn, t.amountMinor]),
    ).toEqual([
      ["2026-06-15", 3_334],
      ["2026-07-15", 3_333],
      ["2026-08-15", 3_333],
    ]);
  });

  it("divisão exata não grava firstAmountMinor", async () => {
    await store.createSeries(COMPRA, { ...MENSAL, installments: 2 }, "2026-06-20");
    expect(onlySeries().amountMinor).toBe(5_000);
    expect(onlySeries()).not.toHaveProperty("firstAmountMinor");
  });
});

describe("autoria", () => {
  it("o mês gerado no aparelho de outra pessoa sai com o autor da série", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-06-10");
    session.localUserId.value = "AUTOR-2";

    await store.materializeDue("2026-08-10");

    expect(alive().map((t) => t.userId)).toEqual(["AUTOR-1", "AUTOR-1", "AUTOR-1"]);
  });

  it("editSeries não troca o autor, nem com userId contrabandeado no draft", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-06-10");
    const serie = onlySeries();
    const draft = { ...draftOf(serie), description: "Salário novo", userId: "INTRUSO" };

    await store.editSeries(serie.id, draft as RecurrenceDraft);

    expect(onlySeries()).toMatchObject({ description: "Salário novo", userId: "AUTOR-1" });
  });

  it("repairAuthors corrige série antiga e meses de outro aparelho, e é idempotente", async () => {
    // Formato antigo: série sem autor, junho gerado por quem criou, julho pelo outro.
    await session.mutate("recurrences", (repo) => repo.create(mensalDraft(), "SERIE-ANTIGA"));
    await store.materializeDue("2026-06-10");
    session.localUserId.value = "AUTOR-2";
    const julhoId = stableEntityIdV1(occurrenceKey("SERIE-ANTIGA", "2026-07"));
    const junho = alive()[0];
    if (junho === undefined) throw new Error("junho não materializou");
    await session.putRows({
      transactions: [
        {
          ...junho,
          id: julhoId,
          occurredOn: "2026-07-05",
          occurrenceKey: occurrenceKey("SERIE-ANTIGA", "2026-07"),
          userId: "AUTOR-2",
        },
      ],
    });

    await store.repairAuthors();

    expect(session.state.value.recurrences["SERIE-ANTIGA"]?.userId).toBe("AUTOR-1");
    expect(session.state.value.transactions[julhoId]).toMatchObject({
      userId: "AUTOR-1",
      dirty: 1,
    });
    expect((await db.transactions.get(julhoId))?.userId).toBe("AUTOR-1");

    const antes = session.state.value;
    await store.repairAuthors();
    expect(session.state.value).toBe(antes);
  });
});

describe("editFollowing", () => {
  /** Rascunho que o formulário mandaria para a ocorrência da competência. */
  function rascunhoDe(seriesId: string, period: string, over: Partial<TransactionDraft> = {}) {
    const row = session.state.value.transactions[stableEntityIdV1(occurrenceKey(seriesId, period))];
    if (row === undefined) throw new Error(`${period} não materializou`);
    const draft: TransactionDraft = {
      kind: row.kind,
      description: row.description,
      amountMinor: row.amountMinor,
      currency: "BRL",
      categoryId: row.categoryId,
      paymentMethodId: row.paymentMethodId,
      cashbackMinor: row.cashbackMinor,
      occurredOn: row.occurredOn,
      recurrenceId: row.recurrenceId,
      occurrenceKey: row.occurrenceKey,
      ...over,
    };
    return { id: row.id, draft };
  }

  function categoriaDe(seriesId: string, period: string) {
    return session.state.value.transactions[stableEntityIdV1(occurrenceKey(seriesId, period))]
      ?.categoryId;
  }

  it("leva a categoria à série e às próximas; o mês anterior fica", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    const { id, draft } = rascunhoDe(series.id, "2026-07", { categoryId: "CAT-NOVA" });

    await store.editFollowing(id, draft);

    expect(session.state.value.recurrences[series.id]?.categoryId).toBe("CAT-NOVA");
    expect(categoriaDe(series.id, "2026-06")).toBeNull();
    expect(categoriaDe(series.id, "2026-07")).toBe("CAT-NOVA");
    expect(categoriaDe(series.id, "2026-08")).toBe("CAT-NOVA");
    expect((await db.recurrences.get(series.id))?.categoryId).toBe("CAT-NOVA");
    expect((await db.recurrences.get(series.id))?.dirty).toBe(1);

    // O mês seguinte nasce da série já atualizada.
    await store.materializeDue("2026-09-10");
    expect(categoriaDe(series.id, "2026-09")).toBe("CAT-NOVA");
  });

  it("valor vira reajuste a partir da competência; autor e campos da série não mudam", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    const { id, draft } = rascunhoDe(series.id, "2026-07", { amountMinor: 550_000 });

    await store.editFollowing(id, { ...draft, userId: "INTRUSO" } as TransactionDraft);

    expect(session.state.value.recurrences[series.id]).toMatchObject({
      amountMinor: 500_000,
      updatedAt: series.updatedAt,
    });
    expect(
      session.state.value.recurrenceAdjustments[adjustmentId(series.id, "2026-07")],
    ).toMatchObject({ fromPeriod: "2026-07", amountMinor: 550_000 });
    expect(amountOf(series.id, "2026-06")).toBe(500_000);
    expect(amountOf(series.id, "2026-07")).toBe(550_000);
    expect(amountOf(series.id, "2026-08")).toBe(550_000);
    expect(session.state.value.transactions[id]?.userId).toBe("AUTOR-1");
  });

  it("valor inválido no reajuste rejeita e não grava nada", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    const { id, draft } = rascunhoDe(series.id, "2026-07", { amountMinor: 1.5 });

    await expect(store.editFollowing(id, draft)).rejects.toThrow("Valor de reajuste inválido");

    expect(session.error.value).toBe("Valor de reajuste inválido");
    expect(await db.recurrenceAdjustments.count()).toBe(0);
    expect(amountOf(series.id, "2026-07")).toBe(500_000);
  });

  it("sem nada da série para mudar, grava só a ocorrência", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    const { id, draft } = rascunhoDe(series.id, "2026-07", { occurredOn: "2026-07-06" });

    await store.editFollowing(id, draft);

    expect(session.state.value.transactions[id]?.occurredOn).toBe("2026-07-06");
    expect(session.state.value.recurrences[series.id]?.updatedAt).toBe(series.updatedAt);
  });

  it("série mudada em outra aba: nada é gravado e o erro é StaleRowsError", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const series = onlySeries();
    const sessionB = createSession(testSessionDeps(db));
    await sessionB.init();
    await sessionB.mutate("recurrences", (repo) =>
      repo.update(series.id, { description: "Salário B" }),
    );
    const { id, draft } = rascunhoDe(series.id, "2026-07", { categoryId: "CAT-NOVA" });

    await expect(store.editFollowing(id, draft)).rejects.toBeInstanceOf(StaleRowsError);

    expect(session.error.value).not.toBeNull();
    expect((await db.transactions.get(id))?.categoryId).toBeNull();
    expect((await db.recurrences.get(series.id))?.categoryId).toBeNull();
    // A sessão se cura: a série passa a ser a que o banco tem.
    expect(session.state.value.recurrences[series.id]?.description).toBe("Salário B");
  });

  it("parcela: a categoria vale para as parcelas seguintes", async () => {
    await store.createSeries(
      { ...DRAFT, kind: "expense", amountMinor: 30_000 },
      {
        ...MENSAL,
        installments: 3,
      },
      "2026-07-10",
    );
    const series = onlySeries();
    const { id, draft } = rascunhoDe(series.id, "2026-06", { categoryId: "CAT-NOVA" });

    await store.editFollowing(id, draft);
    await store.materializeDue("2026-08-10");

    expect(categoriaDe(series.id, "2026-07")).toBe("CAT-NOVA");
    expect(categoriaDe(series.id, "2026-08")).toBe("CAT-NOVA");
  });
});

describe("repairDuplicates", () => {
  const S = "01JC0000000000000000000001";
  const K = occurrenceKey(S, "2026-08");
  const V1 = stableEntityIdV1(K);
  const V2 = stableEntityIdV2(K);
  const R = "01JC0000000000000000000R01";
  const D1 = stableEntityIdV1(depositSeed(R, "2026-08"));
  const D2 = stableEntityIdV2(depositSeed(R, "2026-08"));

  function ocorrencia(id: string, over: Partial<TransactionDraft> = {}) {
    return buildRow<Transaction>(
      session.clock(),
      {
        ...DRAFT,
        occurredOn: "2026-08-05",
        recurrenceId: S,
        occurrenceKey: K,
        userId: "AUTOR-1",
        ...over,
      },
      id,
    );
  }

  function deposito(id: string, period?: string) {
    return buildRow<ReserveMovement>(
      session.clock(),
      {
        reserveId: R,
        amountMinor: 5_000,
        occurredOn: "2026-08-10",
        userId: "AUTOR-1",
        description: null,
        reason: null,
        recurring: true,
        ...(period === undefined ? {} : { period }),
      },
      id,
    );
  }

  it("apaga a cópia v2 e deixa a v1 viva; a confirmação da v2 vai para a v1", async () => {
    await session.putRows({
      transactions: [
        ocorrencia(V1, { estimated: true, amountMinor: 1_000 }),
        ocorrencia(V2, { estimated: false, amountMinor: 1_234, importKey: "K2" }),
      ],
      reserveMovements: [deposito(D1), deposito(D2, "2026-08")],
    });

    await store.repairDuplicates();

    expect(await db.transactions.get(V1)).toMatchObject({
      deletedAt: null,
      estimated: false,
      amountMinor: 1_234,
      importKey: "K2",
      dirty: 1,
    });
    expect((await db.transactions.get(V2))?.deletedAt).not.toBeNull();
    // A exclusão é marcada como do reparo (achado 4): a folha distingue da exclusão da pessoa.
    expect((await db.transactions.get(V2))?.mergedInto).toBe(V1);
    expect((await db.reserveMovements.get(D1))?.deletedAt).toBeNull();
    expect((await db.reserveMovements.get(D2))?.deletedAt).not.toBeNull();
    expect((await db.reserveMovements.get(D2))?.mergedInto).toBe(D1);
    expect(session.fullState.value.transactions[V2]?.deletedAt).not.toBeNull();
  });

  it("sem duplicata não grava nada", async () => {
    await session.putRows({ transactions: [ocorrencia(V1)] });
    const antes = await db.transactions.get(V1);
    const putRows = vi.spyOn(session, "putRowsIfCurrent");

    await store.repairDuplicates();

    expect(putRows).not.toHaveBeenCalled();
    expect(await db.transactions.get(V1)).toEqual(antes);
  });

  it("a v1 mudou no banco desde a leitura: não apaga a v2 (nunca zero vivas)", async () => {
    await session.putRows({ transactions: [ocorrencia(V1), ocorrencia(V2)] });
    // Outra aba apaga a v1 sem a sessão saber.
    const v1 = await db.transactions.get(V1);
    if (v1 === undefined) throw new Error("sem v1");
    const hlc = v1.updatedAt.replace(/^\d/, "9");
    await db.transactions.put({ ...v1, deletedAt: hlc, updatedAt: hlc });

    await store.repairDuplicates();

    expect((await db.transactions.get(V2))?.deletedAt).toBeNull();
    expect(session.error.value).toBeNull();
  });
});

describe("materializeDue com o lugar v1 disputado", () => {
  const A = "01JC0000000000000000000001";
  const C = collidingId("01JC0000000000000000000", A, (id) => occurrenceKey(id, "2026-08"));

  async function serie(id: string, book?: "business") {
    const row = buildRow<Recurrence>(
      session.clock(),
      { ...mensalDraft(), startOn: "2026-08-05", userId: "AUTOR-1" },
      id,
      book,
    );
    await session.putRows({ recurrences: [row] });
  }

  it("séries de contas diferentes no mesmo lugar: as duas nascem no mesmo lote", async () => {
    await serie(A);
    await serie(C, "business");

    await store.materializeDue("2026-08-10");

    const ka = occurrenceKey(A, "2026-08");
    const kc = occurrenceKey(C, "2026-08");
    const [first, second] = [ka, kc].sort();
    expect(await db.transactions.get(stableEntityIdV1(first ?? ""))).toMatchObject({
      occurrenceKey: first,
    });
    expect(await db.transactions.get(stableEntityIdV2(second ?? ""))).toMatchObject({
      occurrenceKey: second,
    });
    expect(await db.transactions.count()).toBe(2);
    expect(session.error.value).toBeNull();
  });
});

describe("recoverOccurrences (folha de recuperação)", () => {
  const A = "01JC0000000000000000000001";
  const B = "01JC0000000000000000000002";
  // Par verificado da spec: A em 2027-02 e B em 2027-01 caem no mesmo v1.
  const KA = occurrenceKey(A, "2027-02");
  const SLOT = stableEntityIdV1(KA);

  async function cenario() {
    const clock = session.clock();
    const serie = buildRow<Recurrence>(
      clock,
      { ...mensalDraft(), startOn: "2027-01-05", endOn: "2027-03-05", userId: "AUTOR-1" },
      A,
    );
    const reajuste = buildRow<RecurrenceAdjustment>(
      clock,
      { recurrenceId: A, fromPeriod: "2027-02", amountMinor: 610_000 },
      adjustmentId(A, "2027-02"),
    );
    // A ocorrência de B ocupou o lugar de fevereiro de A antes da correção.
    const deB = buildRow<Transaction>(
      clock,
      {
        ...DRAFT,
        occurredOn: "2027-01-05",
        recurrenceId: B,
        occurrenceKey: occurrenceKey(B, "2027-01"),
        userId: null,
      },
      SLOT,
    );
    await session.putRows({
      recurrences: [serie],
      recurrenceAdjustments: [reajuste],
      transactions: [deB],
    });
    // O boot de março: janeiro e março nascem em v1; fevereiro fica para a folha.
    await store.materializeDue("2027-03-10");
  }

  it("candidatas: só a competência passada com o lugar de outro fato, com o valor da competência", async () => {
    await cenario();
    const lost = recoveryCandidates(session.fullState.value, "personal", "2027-03-10");
    expect(
      lost.map((item) => [item.draft.occurrenceKey, item.entityId, item.draft.amountMinor]),
    ).toEqual([[KA, stableEntityIdV2(KA), 610_000]]);
  });

  it("Recriar grava em v2 com o autor da série; depois disso não há candidatas", async () => {
    await cenario();
    const lost = recoveryCandidates(session.fullState.value, "personal", "2027-03-10");

    await store.recoverOccurrences(lost, []);

    expect(await db.transactions.get(stableEntityIdV2(KA))).toMatchObject({
      deletedAt: null,
      recurrenceId: A,
      occurrenceKey: KA,
      amountMinor: 610_000,
      occurredOn: "2027-02-05",
      userId: "AUTOR-1",
    });
    expect(recoveryCandidates(session.fullState.value, "personal", "2027-03-10")).toEqual([]);
    // O lugar de B segue intacto.
    expect((await db.transactions.get(SLOT))?.recurrenceId).toBe(B);
  });

  it("Não recriar grava um tombstone v2 com a chave; nada volta no próximo boot", async () => {
    await cenario();
    const lost = recoveryCandidates(session.fullState.value, "personal", "2027-03-10");

    await store.recoverOccurrences([], lost);
    await store.materializeDue("2027-03-11");

    const row = await db.transactions.get(stableEntityIdV2(KA));
    expect(row?.deletedAt).not.toBeNull();
    expect(row).toMatchObject({ recurrenceId: A, occurrenceKey: KA });
    expect(recoveryCandidates(session.fullState.value, "personal", "2027-03-10")).toEqual([]);
    expect(
      alive()
        .filter((t) => t.recurrenceId === A)
        .map((t) => t.occurredOn)
        .sort(),
    ).toEqual(["2027-01-05", "2027-03-05"]);
  });
});
