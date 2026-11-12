import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { MAX_MINOR } from "../../domain/money/mask";
import { createSession, type Session } from "../session/session";
import { createDebtsStore, type DebtInput, type DebtsStore } from "./store";

const FINANCIAMENTO: DebtInput = {
  name: "  Financiamento do forno ",
  creditor: " Banco do Povo ",
  principalMinor: 900_000,
  balanceMinor: 700_000,
  dueOn: "2026-12-10",
};

let db: HomeFinanceDb;
let session: Session;
let store: DebtsStore;

beforeEach(async () => {
  db = openTestDb();
  session = createSession(testSessionDeps(db));
  await session.init();
  store = createDebtsStore(session);
});

afterEach(async () => {
  await db.delete();
});

describe("dívidas: conta comercial", () => {
  beforeEach(async () => {
    await session.setActiveBook("business");
  });

  it("create grava com book comercial e textos aparados", async () => {
    const debt = await store.create(FINANCIAMENTO);

    expect(debt).toMatchObject({
      name: "Financiamento do forno",
      creditor: "Banco do Povo",
      principalMinor: 900_000,
      balanceMinor: 700_000,
      dueOn: "2026-12-10",
      book: "business",
      deletedAt: null,
      dirty: 1,
    });
    expect((await db.debts.get(debt.id))?.book).toBe("business");
    expect(session.state.value.debts[debt.id]).toEqual(debt);
  });

  it("credor vazio e sem vencimento viram null; saldo zero (quitada) vale", async () => {
    const debt = await store.create({
      ...FINANCIAMENTO,
      creditor: "   ",
      dueOn: null,
      balanceMinor: 0,
    });
    expect(debt.creditor).toBeNull();
    expect(debt.dueOn).toBeNull();
    expect(debt.balanceMinor).toBe(0);
  });

  it("edit atualiza o saldo e limpa credor e vencimento com null", async () => {
    const debt = await store.create(FINANCIAMENTO);
    const edited = await store.edit(debt.id, {
      ...FINANCIAMENTO,
      balanceMinor: 650_000,
      creditor: null,
      dueOn: null,
    });

    expect(edited).toMatchObject({
      id: debt.id,
      balanceMinor: 650_000,
      creditor: null,
      dueOn: null,
      principalMinor: 900_000,
      book: "business",
    });
    expect(edited.updatedAt > debt.updatedAt).toBe(true);
    expect((await db.debts.get(debt.id))?.creditor).toBeNull();
  });

  it("edit sem mudança real não carimba HLC novo, nem quando a linha não tinha credor", async () => {
    const semCredor = await store.create({ ...FINANCIAMENTO, creditor: null, dueOn: null });
    // Linha gravada por outro aparelho sem as colunas opcionais.
    const { creditor: _c, dueOn: _d, ...bare } = semCredor;
    await db.debts.put(bare);
    await session.reload();

    const same = await store.edit(semCredor.id, {
      ...FINANCIAMENTO,
      name: "Financiamento do forno",
      creditor: null,
      dueOn: null,
    });
    expect(same.updatedAt).toBe(semCredor.updatedAt);
  });

  it("remove é exclusão lógica", async () => {
    const debt = await store.create(FINANCIAMENTO);
    await store.remove(debt.id);

    const stored = await db.debts.get(debt.id);
    expect(stored?.deletedAt).not.toBeNull();
    expect(stored?.dirty).toBe(1);
    await expect(store.remove(debt.id)).rejects.toThrow("Dívida não existe.");
    await expect(store.edit(debt.id, FINANCIAMENTO)).rejects.toThrow("Dívida não existe.");
  });

  it.each([
    ["nome vazio", { name: " " }, "Dê um nome à dívida."],
    ["credor grande demais", { creditor: "x".repeat(61) }, "O credor aceita até 60 caracteres."],
    [
      "saldo maior que o original",
      { principalMinor: 100_000, balanceMinor: 100_001 },
      "O saldo atual não pode ser maior que o valor original.",
    ],
    [
      "original zero",
      { principalMinor: 0, balanceMinor: 0 },
      "Informe o valor original da dívida.",
    ],
    [
      "original acima do teto",
      { principalMinor: MAX_MINOR + 1 },
      "Informe o valor original da dívida.",
    ],
    ["saldo negativo", { balanceMinor: -1 }, "Informe o saldo atual (zero se já quitou)."],
    ["saldo fracionário", { balanceMinor: 1.5 }, "Informe o saldo atual (zero se já quitou)."],
    ["vencimento inexistente", { dueOn: "2026-13-01" }, "Data inválida."],
  ])("recusa %s sem gravar nada e preenche session.error", async (_name, patch, message) => {
    await expect(store.create({ ...FINANCIAMENTO, ...patch })).rejects.toThrow(message);
    expect(await db.debts.count()).toBe(0);
    expect(session.error.value).toBe(message);
  });

  it("edit também recusa saldo maior que o original", async () => {
    const debt = await store.create(FINANCIAMENTO);
    await expect(store.edit(debt.id, { ...FINANCIAMENTO, balanceMinor: 900_001 })).rejects.toThrow(
      "O saldo atual não pode ser maior que o valor original.",
    );
    expect((await db.debts.get(debt.id))?.balanceMinor).toBe(700_000);
  });
});

describe("dívidas: isolamento entre contas", () => {
  it("na conta pessoal não cria, não edita e não apaga", async () => {
    await session.setActiveBook("business");
    const debt = await store.create(FINANCIAMENTO);
    await session.setActiveBook("personal");

    const message = "Dívidas só existem na conta comercial.";
    await expect(store.create(FINANCIAMENTO)).rejects.toThrow(message);
    await expect(store.edit(debt.id, FINANCIAMENTO)).rejects.toThrow(message);
    await expect(store.remove(debt.id)).rejects.toThrow(message);
    expect(await db.debts.count()).toBe(1);
    expect((await db.debts.get(debt.id))?.deletedAt).toBeNull();
  });

  it("a visão pessoal não enxerga as dívidas", async () => {
    await session.setActiveBook("business");
    await store.create(FINANCIAMENTO);
    await session.setActiveBook("personal");
    expect(session.state.value.debts).toEqual({});
  });
});
