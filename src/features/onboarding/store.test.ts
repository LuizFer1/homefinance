import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { createSession, LOCAL_USER_ID_KEY } from "../session/session";
import { createOnboardingStore } from "./store";

const LUIZ = { name: "Luiz", color: "teal", avatar: null } as const;

let db: HomeFinanceDb;

beforeEach(() => {
  db = openTestDb();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("createOnboardingStore", () => {
  it("precisa de onboarding só depois do boot e sem perfil local", async () => {
    const session = createSession(testSessionDeps(db));
    const store = createOnboardingStore(session);
    expect(store.needsOnboarding.value).toBe(false);

    await session.init();
    expect(store.needsOnboarding.value).toBe(true);
  });

  it("complete grava tudo e sobrevive ao reabrir", async () => {
    const session = createSession(testSessionDeps(db));
    await session.init();
    await createOnboardingStore(session).complete(LUIZ);

    const reaberta = createSession(testSessionDeps(db));
    await reaberta.init();

    expect(createOnboardingStore(reaberta).needsOnboarding.value).toBe(false);
    expect(Object.keys(reaberta.state.value.categories)).toHaveLength(12);
    expect(Object.keys(reaberta.state.value.paymentMethods)).toHaveLength(4);
    expect(reaberta.state.value.users[reaberta.localUserId.value ?? ""]?.name).toBe("Luiz");
  });

  it("falha no meio não grava nada e continua pedindo onboarding", async () => {
    const session = createSession(testSessionDeps(db));
    await session.init();
    const store = createOnboardingStore(session);
    vi.spyOn(db.categories, "bulkPut").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(store.complete(LUIZ)).rejects.toThrow("quota exceeded");

    expect(store.needsOnboarding.value).toBe(true);
    expect(await db.users.count()).toBe(0);
    expect(await db.paymentMethods.count()).toBe(0);
    expect(await db.categories.count()).toBe(0);
    expect(await db.meta.get(LOCAL_USER_ID_KEY)).toBeUndefined();
    expect(session.error.value).toBe("quota exceeded");
  });

  it("dois complete simultâneos semeiam só uma vez", async () => {
    const session = createSession(testSessionDeps(db));
    await session.init();
    const store = createOnboardingStore(session);

    // As duas chamadas começam antes de qualquer `localUserId` ser publicado,
    // então um guard que só olha `localUserId.value !== null` não pega isto.
    await Promise.all([store.complete(LUIZ), store.complete(LUIZ)]);

    expect(await db.users.count()).toBe(1);
    expect(await db.paymentMethods.count()).toBe(4);
    expect(await db.categories.count()).toBe(12);
  });

  it("depois de uma falha, um novo complete funciona", async () => {
    const session = createSession(testSessionDeps(db));
    await session.init();
    const store = createOnboardingStore(session);
    vi.spyOn(db.categories, "bulkPut").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(store.complete(LUIZ)).rejects.toThrow("quota exceeded");
    await store.complete(LUIZ);

    expect(store.needsOnboarding.value).toBe(false);
    expect(await db.users.count()).toBe(1);
    expect(await db.categories.count()).toBe(12);
  });
});
