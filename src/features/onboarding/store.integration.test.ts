import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HomeFinanceDb } from "../../data/db";
import { createEventStore, type EventStore } from "../../data/event-store";
import type { DomainEvent } from "../../domain/events/types";
import { userCreated } from "../../domain/events/user";
import { cryptoRandomChunk } from "../../domain/ids/ulid";
import { listPaymentMethods, listTransactions } from "../../domain/projections/selectors";
import { createSession, LOCAL_USER_ID_KEY, type Session } from "../session/session";
import { createTransactionsStore } from "../transactions/store";
import { createOnboardingStore, type OnboardingStore } from "./store";

const FOTO = "data:image/webp;base64,AAAA";
const OUTRO_DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";

const TX_DRAFT = {
  kind: "expense",
  description: "Mercado",
  amountMinor: 12_345,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-08-07",
} as const;

let db: HomeFinanceDb;
let dbName: string;
let counter = 0;

function build(): { session: Session; onboarding: OnboardingStore; events: EventStore } {
  const events = createEventStore(db);
  const session = createSession({
    events,
    now: () => Date.now(),
    randomChunk: cryptoRandomChunk,
  });
  return { session, onboarding: createOnboardingStore(session), events };
}

/** Fecha e reabre o banco, como o app faria ao ser reaberto pelo usuário. */
function reabrir() {
  db.close();
  db = new HomeFinanceDb(dbName);
  return build();
}

beforeEach(() => {
  counter += 1;
  dbName = `homefinance-onboarding-${counter}`;
  db = new HomeFinanceDb(dbName);
});

afterEach(async () => {
  await db.delete();
});

describe("primeiro uso sobre IndexedDB real", () => {
  it("concluir com foto sobrevive a fechar e reabrir o banco", async () => {
    const primeiro = build();
    await primeiro.session.init();
    expect(primeiro.onboarding.needsOnboarding.value).toBe(true);

    await primeiro.onboarding.complete({ name: "Luiz", color: "teal", avatar: FOTO });

    const segundo = reabrir();
    await segundo.session.init();

    expect(segundo.onboarding.needsOnboarding.value).toBe(false);
    expect(
      listPaymentMethods(segundo.session.state.value)
        .map((m) => m.kind)
        .sort(),
    ).toEqual(["cash", "credit", "debit", "pix"]);

    const id = segundo.session.localUserId.value ?? "";
    expect(segundo.session.state.value.users[id]?.name).toBe("Luiz");
    // A foto sobreviveu ao refold: ela vive no evento, não numa tabela à parte.
    expect(segundo.session.state.value.users[id]?.avatar).toBe(FOTO);
  });

  it("lote que falha no meio nao deixa nada gravado, e o wizard reaparece", async () => {
    // Prova de ponta a ponta da transacao `rw`: sem ela, os eventos anteriores
    // ao defeito ficariam gravados para sempre — o log e append-only.
    const { session, events } = build();
    await session.init();

    const bom = userCreated({
      eventId: "01J9F3K2M7QX8YB4TVWZ0DCEF1",
      entityId: "01J9F3K2M7QX8YB4TVWZ0DCEHU",
      deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHR",
      hlc: "1754697700000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHR",
      draft: { name: "Luiz", color: "teal", avatar: FOTO },
    });
    // `id` ausente viola a primary key e faz o Dexie abortar a transacao.
    const defeituoso = { ...bom, id: undefined } as unknown as DomainEvent;

    await expect(
      events.appendBatch([bom, defeituoso], { [LOCAL_USER_ID_KEY]: bom.entityId }),
    ).rejects.toThrow();

    const depois = reabrir();
    await depois.session.init();

    expect(await depois.events.readAll()).toHaveLength(0);
    expect(await depois.events.getMeta(LOCAL_USER_ID_KEY)).toBeNull();
    expect(depois.onboarding.needsOnboarding.value).toBe(true);
  });

  it("user de outro device persistido nao dispensa o cadastro local", async () => {
    const { session, events } = build();
    await events.append(
      userCreated({
        eventId: "01J9F3K2M7QX8YB4TVWZ0DCEE1",
        entityId: "01J9F3K2M7QX8YB4TVWZ0DCEHO",
        deviceId: OUTRO_DEVICE,
        hlc: `1754697500000-0000-${OUTRO_DEVICE}`,
        draft: { name: "Ana", color: "rose", avatar: null },
      }),
    );

    const { session: fresca, onboarding } = build();
    await fresca.init();

    expect(fresca.state.value.users["01J9F3K2M7QX8YB4TVWZ0DCEHO"]?.name).toBe("Ana");
    expect(onboarding.needsOnboarding.value).toBe(true);
    void session;
  });

  it("lancamento criado depois do wizard carrega o autor, e editar nao o muda", async () => {
    const { session, onboarding, events } = build();
    await session.init();
    await onboarding.complete({ name: "Luiz", color: "teal", avatar: null });
    const autor = session.localUserId.value;

    const store = createTransactionsStore(session);
    await store.add(TX_DRAFT);
    const criado = listTransactions(session.state.value)[0];
    await store.edit(criado?.id ?? "", { amountMinor: 999 });

    const log = await events.readAll();
    const create = log.find((e) => e.entity === "transaction" && e.action === "create");
    const update = log.find((e) => e.entity === "transaction" && e.action === "update");

    expect(create?.data).toMatchObject({ userId: autor });
    expect(update?.data).not.toHaveProperty("userId");
    expect(listTransactions(session.state.value)[0]?.userId).toBe(autor);
  });

  it("apagar o banco devolve o aparelho ao primeiro uso", async () => {
    // E o que "Resetar conta" faz: sem isto, concluir o wizard e um estado sem
    // saida, porque nao ha tela que remova o localUserId.
    const { session, onboarding } = build();
    await session.init();
    await onboarding.complete({ name: "Luiz", color: "teal", avatar: FOTO });

    await db.delete();
    db = new HomeFinanceDb(dbName);
    const depois = build();
    await depois.session.init();

    expect(depois.onboarding.needsOnboarding.value).toBe(true);
    expect(await depois.events.readAll()).toEqual([]);
    expect(listPaymentMethods(depois.session.state.value)).toEqual([]);
  });
});
