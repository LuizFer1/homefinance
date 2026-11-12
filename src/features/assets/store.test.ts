import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { MAX_MINOR } from "../../domain/money/mask";
import { createSession, type Session } from "../session/session";
import { type AssetInput, type AssetsStore, createAssetsStore } from "./store";

const FORNO: AssetInput = {
  kind: "equipment",
  name: "  Forno industrial ",
  valueMinor: 450_000,
  acquiredOn: "2026-08-01",
};

let db: HomeFinanceDb;
let session: Session;
let store: AssetsStore;

beforeEach(async () => {
  db = openTestDb();
  session = createSession(testSessionDeps(db));
  await session.init();
  store = createAssetsStore(session);
});

afterEach(async () => {
  await db.delete();
});

describe("bens: conta comercial", () => {
  beforeEach(async () => {
    await session.setActiveBook("business");
  });

  it("create grava com book comercial, nome aparado e entra na visão", async () => {
    const asset = await store.create(FORNO);

    expect(asset).toMatchObject({
      kind: "equipment",
      name: "Forno industrial",
      valueMinor: 450_000,
      acquiredOn: "2026-08-01",
      book: "business",
      deletedAt: null,
      dirty: 1,
    });
    expect((await db.assets.get(asset.id))?.book).toBe("business");
    expect(session.state.value.assets[asset.id]).toEqual(asset);
  });

  it("edit troca os campos da tela, mantém book e a observação e carimba um HLC maior", async () => {
    const asset = await store.create(FORNO);
    await db.assets.put({ ...asset, note: "nota fiscal 123" });
    await session.reload();

    const edited = await store.edit(asset.id, {
      kind: "inventory",
      name: "Farinha",
      valueMinor: 90_000,
      acquiredOn: "2026-09-01",
    });

    expect(edited).toMatchObject({
      id: asset.id,
      kind: "inventory",
      name: "Farinha",
      valueMinor: 90_000,
      acquiredOn: "2026-09-01",
      book: "business",
      note: "nota fiscal 123",
    });
    expect(edited.updatedAt > asset.updatedAt).toBe(true);
    expect(edited.createdAt).toBe(asset.createdAt);
  });

  it("edit sem mudança não regrava a linha", async () => {
    const asset = await store.create(FORNO);
    const same = await store.edit(asset.id, { ...FORNO, name: "Forno industrial" });
    expect(same.updatedAt).toBe(asset.updatedAt);
  });

  it("remove é exclusão lógica: a linha fica com deletedAt e deixa de existir para a store", async () => {
    const asset = await store.create(FORNO);
    await store.remove(asset.id);

    const stored = await db.assets.get(asset.id);
    expect(stored?.deletedAt).not.toBeNull();
    expect(stored?.dirty).toBe(1);
    await expect(store.edit(asset.id, FORNO)).rejects.toThrow("Bem não existe.");
    await expect(store.remove(asset.id)).rejects.toThrow("Bem não existe.");
  });

  it.each([
    ["nome vazio", { name: "   " }, "Dê um nome ao bem."],
    ["nome grande demais", { name: "x".repeat(61) }, "O nome aceita até 60 caracteres."],
    ["tipo desconhecido", { kind: "vehicle" as never }, "Escolha o tipo do bem."],
    ["valor zero", { valueMinor: 0 }, "Valor inválido."],
    ["valor fracionário", { valueMinor: 10.5 }, "Valor inválido."],
    ["valor acima do teto", { valueMinor: MAX_MINOR + 1 }, "Valor inválido."],
    ["data inexistente", { acquiredOn: "2026-02-30" }, "Data inválida."],
    ["data fora do formato", { acquiredOn: "01/08/2026" }, "Data inválida."],
  ])("recusa %s sem gravar nada e preenche session.error", async (_name, patch, message) => {
    await expect(store.create({ ...FORNO, ...patch })).rejects.toThrow(message);
    expect(await db.assets.count()).toBe(0);
    expect(session.error.value).toBe(message);
  });
});

describe("bens: isolamento entre contas", () => {
  it("na conta pessoal não cria, não edita e não apaga", async () => {
    await session.setActiveBook("business");
    const asset = await store.create(FORNO);
    await session.setActiveBook("personal");

    const message = "Bens só existem na conta comercial.";
    await expect(store.create(FORNO)).rejects.toThrow(message);
    await expect(store.edit(asset.id, FORNO)).rejects.toThrow(message);
    await expect(store.remove(asset.id)).rejects.toThrow(message);
    expect(await db.assets.count()).toBe(1);
    expect((await db.assets.get(asset.id))?.deletedAt).toBeNull();
  });

  it("a visão pessoal não enxerga os bens, e a comercial os recupera ao voltar", async () => {
    await session.setActiveBook("business");
    const asset = await store.create(FORNO);
    await session.setActiveBook("personal");
    expect(session.state.value.assets).toEqual({});

    await session.setActiveBook("business");
    expect(Object.keys(session.state.value.assets)).toEqual([asset.id]);
  });
});
