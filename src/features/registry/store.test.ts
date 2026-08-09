import { describe, expect, it } from "vitest";
import type { EventStore } from "../../data/event-store";
import { compareHlc } from "../../domain/clock/hlc";
import type { DomainEvent } from "../../domain/events/types";
import { listCategories, listPaymentMethods } from "../../domain/projections/selectors";
import { createSession, type Session } from "../session/session";
import { createTransactionsStore } from "../transactions/store";
import { createRegistryStore } from "./store";

const CATEGORY = { name: "Mercado", icon: "utensils", color: "emerald" } as const;
const METHOD = { name: "Nubank", icon: "credit-card", color: "violet", kind: "credit" } as const;

const TX_DRAFT = {
  kind: "expense",
  description: "Compra",
  amountMinor: 1000,
  currency: "BRL",
  categoryId: null,
  occurredOn: "2026-08-07",
} as const;

interface FakeStore extends EventStore {
  events: DomainEvent[];
  failNext: boolean;
}

function fakeEventStore(): FakeStore {
  const meta = new Map<string, string>();
  const state: FakeStore = {
    events: [],
    failNext: false,
    append: async (event) => {
      if (state.failNext) throw new Error("quota exceeded");
      state.events = [...state.events.filter((item) => item.id !== event.id), event];
    },
    readAll: async () => [...state.events].sort((a, b) => (a.hlc < b.hlc ? -1 : 1)),
    getMeta: async (key) => meta.get(key) ?? null,
    setMeta: async (key, value) => {
      meta.set(key, value);
    },
  };
  return state;
}

function newSession(events: FakeStore): Session {
  let millis = 1_754_697_600_000;
  return createSession({
    events,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  });
}

async function ready(events: FakeStore) {
  const session = newSession(events);
  await session.init();
  return { session, registry: createRegistryStore(session) };
}

describe("createRegistryStore", () => {
  it("cria categoria e a publica na projeção", async () => {
    const events = fakeEventStore();
    const { registry, session } = await ready(events);

    await registry.addCategory(CATEGORY);

    const items = listCategories(session.state.value);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("Mercado");
    expect(events.events[0]?.entity).toBe("category");
    expect(events.events[0]?.action).toBe("create");
  });

  it("cria forma de pagamento com o kind", async () => {
    const events = fakeEventStore();
    const { registry, session } = await ready(events);

    await registry.addPaymentMethod(METHOD);

    expect(listPaymentMethods(session.state.value)[0]?.kind).toBe("credit");
  });

  it("edita emitindo apenas o patch recebido", async () => {
    const events = fakeEventStore();
    const { registry, session } = await ready(events);
    await registry.addCategory(CATEGORY);
    const [criada] = listCategories(session.state.value);

    await registry.editCategory(criada?.id ?? "", { color: "rose" });

    const update = events.events.find((event) => event.action === "update");
    expect(update?.data).toEqual({ color: "rose" });
    expect(listCategories(session.state.value)[0]?.color).toBe("rose");
    expect(listCategories(session.state.value)[0]?.name).toBe("Mercado");
  });

  it("não emite evento para patch vazio", async () => {
    // Um log append-only não merece lixo permanente: o evento nunca sai de lá.
    const events = fakeEventStore();
    const { registry, session } = await ready(events);
    await registry.addCategory(CATEGORY);
    const [criada] = listCategories(session.state.value);
    const antes = events.events.length;

    await registry.editCategory(criada?.id ?? "", {});

    expect(events.events).toHaveLength(antes);
  });

  it("remove gravando tombstone sem apagar do bucket", async () => {
    const events = fakeEventStore();
    const { registry, session } = await ready(events);
    await registry.addCategory(CATEGORY);
    const [criada] = listCategories(session.state.value);

    await registry.removeCategory(criada?.id ?? "");

    expect(listCategories(session.state.value)).toEqual([]);
    expect(session.state.value.categories[criada?.id ?? ""]?.deleted).toBe(true);
    expect(events.events.some((event) => event.action === "delete")).toBe(true);
  });

  it("não altera a projeção quando a gravação falha", async () => {
    const events = fakeEventStore();
    const { registry, session } = await ready(events);
    events.failNext = true;

    await registry.addCategory(CATEGORY);

    expect(listCategories(session.state.value)).toEqual([]);
    expect(session.error.value).toBe("quota exceeded");
  });

  it("apagar categoria não apaga o lançamento que a referencia", async () => {
    const events = fakeEventStore();
    const { session, registry } = await ready(events);
    const transactions = createTransactionsStore(session);
    await registry.addCategory(CATEGORY);
    const [categoria] = listCategories(session.state.value);
    await transactions.add({ ...TX_DRAFT, categoryId: categoria?.id ?? null });

    await registry.removeCategory(categoria?.id ?? "");

    const lancamentos = Object.values(session.state.value.transactions);
    expect(lancamentos[0]?.deleted).toBe(false);
    expect(lancamentos[0]?.categoryId).toBe(categoria?.id);
  });

  it("compartilha o relógio com a store de transações", async () => {
    // A prova pela porta da frente de que existe um relógio por aparelho e não um
    // por store. Com dois relógios os HLCs se entrelaçariam, cada escrita cairia
    // antes do lastHlc da outra store e forçaria refold do log inteiro.
    const events = fakeEventStore();
    const { session, registry } = await ready(events);
    const transactions = createTransactionsStore(session);

    await registry.addCategory(CATEGORY);
    await transactions.add(TX_DRAFT);
    await registry.addPaymentMethod(METHOD);
    await transactions.add({ ...TX_DRAFT, description: "Outra" });

    const hlcs = events.events.map((event) => event.hlc);
    expect(new Set(hlcs).size).toBe(hlcs.length);
    for (let i = 1; i < hlcs.length; i += 1) {
      expect(compareHlc(hlcs[i - 1] ?? "", hlcs[i] ?? "")).toBe(-1);
    }
  });

  it("nenhuma escrita entrelaçada força refold: lastHlc só cresce", async () => {
    const events = fakeEventStore();
    const { session, registry } = await ready(events);
    const transactions = createTransactionsStore(session);

    const observados: string[] = [];
    for (const escrever of [
      () => registry.addCategory(CATEGORY),
      () => transactions.add(TX_DRAFT),
      () => registry.addPaymentMethod(METHOD),
    ]) {
      await escrever();
      observados.push(session.state.value.lastHlc ?? "");
    }

    for (let i = 1; i < observados.length; i += 1) {
      expect(compareHlc(observados[i - 1] ?? "", observados[i] ?? "")).toBe(-1);
    }
  });
});
