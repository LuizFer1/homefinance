// Antes de qualquer import do Dexie: ele captura o `indexedDB` global ao carregar.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { resolveCategoryName } from "../../domain/projections/selectors";
import { createOnboardingStore } from "../onboarding/store";
import { createRegistryStore } from "../registry/store";
import { resetDevice } from "../settings/reset";
import { createTransactionsStore } from "../transactions/store";
import { createSession } from "./session";

/**
 * Ponta a ponta sobre banco real: grava por uma sessão e confere por **outra**,
 * aberta sobre o mesmo banco — o que o app faz a cada recarga. É o que os
 * testes de store sozinhos não provam: que o dado volta do disco, e não do
 * estado em memória de quem gravou.
 */

const FOTO = "data:image/webp;base64,AAAA";

let abertos: HomeFinanceDb[] = [];

function novoBanco(): HomeFinanceDb {
  const db = openTestDb();
  abertos.push(db);
  return db;
}

async function abrir(db: HomeFinanceDb) {
  const session = createSession(testSessionDeps(db));
  await session.init();
  if (session.status.value !== "ready") throw new Error(`init: ${session.error.value}`);
  return session;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(abertos.map((db) => db.delete()));
  abertos = [];
});

describe("persistência entre sessões", () => {
  it("apagar categoria usada mantém o lançamento vivo depois de reabrir", async () => {
    // Apagar não cascateia: o lançamento continua, apontando para uma linha
    // com `deletedAt`, e a tela mostra o rótulo neutro.
    const db = novoBanco();
    const session = await abrir(db);
    const registry = createRegistryStore(session);
    const mercado = await registry.addCategory({
      name: "Mercado",
      icon: "utensils",
      color: "emerald",
      kind: "expense",
    });
    const lancamento = await createTransactionsStore(session).add({
      kind: "expense",
      description: "Feira",
      amountMinor: 4_500,
      currency: "BRL",
      categoryId: mercado.id,
      paymentMethodId: null,
      cashbackMinor: null,
      occurredOn: "2026-09-20",
      recurrenceId: null,
      occurrenceKey: null,
    });
    await registry.removeCategory(mercado.id);

    const reaberta = await abrir(db);
    const linha = reaberta.state.value.transactions[lancamento.id];

    expect(linha?.deletedAt).toBeNull();
    expect(linha?.categoryId).toBe(mercado.id);
    expect(reaberta.state.value.categories[mercado.id]?.deletedAt).not.toBeNull();
    expect(resolveCategoryName(reaberta.state.value, mercado.id)).toBe("Categoria removida");
  });

  it("reset devolve o aparelho ao primeiro uso, com as tabelas vazias", async () => {
    const db = novoBanco();
    const session = await abrir(db);
    await createOnboardingStore(session).complete({ name: "Luiz", color: "teal", avatar: null });
    const reload = vi.fn();

    await resetDevice({ db, reload });

    // O reload recria o banco com o mesmo nome, como a página faz ao recarregar.
    const recriado = new HomeFinanceDb(db.name);
    abertos.push(recriado);
    const reaberta = await abrir(recriado);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(createOnboardingStore(reaberta).needsOnboarding.value).toBe(true);
    expect(reaberta.localUserId.value).toBeNull();
    expect(await recriado.users.count()).toBe(0);
    expect(await recriado.categories.count()).toBe(0);
    expect(await recriado.paymentMethods.count()).toBe(0);
    expect(await recriado.transactions.count()).toBe(0);
  });

  it("primeiro uso com foto mantém a foto depois de reabrir", async () => {
    const db = novoBanco();
    const session = await abrir(db);
    await createOnboardingStore(session).complete({ name: "Luiz", color: "teal", avatar: FOTO });

    const reaberta = await abrir(db);
    const perfil = reaberta.state.value.users[reaberta.localUserId.value ?? ""];

    expect(perfil).toMatchObject({ name: "Luiz", avatar: FOTO });
  });
});
