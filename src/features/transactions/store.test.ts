import { describe, expect, it } from "vitest";
import type { EventStore } from "../../data/event-store";
import type { TransactionDraft } from "../../domain/events/transaction";
import type { DomainEvent } from "../../domain/events/types";
import { listTransactions } from "../../domain/projections/selectors";
import { createTransactionsStore } from "./store";

const DRAFT: TransactionDraft = {
  kind: "expense",
  description: "Mercado",
  amountMinor: 12_345,
  currency: "BRL",
  categoryId: null,
  occurredOn: "2026-08-07",
};

interface FakeStore extends EventStore {
  events: DomainEvent[];
  failNext: boolean;
}

function fakeEventStore(seed: DomainEvent[] = []): FakeStore {
  const meta = new Map<string, string>();
  const state: FakeStore = {
    events: [...seed],
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

function deps(events: FakeStore, startAt = 1_754_697_600_000) {
  let millis = startAt;
  return {
    events,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count: number) => Array.from({ length: count }, (_, i) => i % 32),
  };
}

describe("createTransactionsStore", () => {
  it("fica pronta num banco vazio", async () => {
    const store = createTransactionsStore(deps(fakeEventStore()));

    await store.init();

    expect(store.status.value).toBe("ready");
    expect(listTransactions(store.state.value)).toEqual([]);
  });

  it("grava o deviceId no primeiro boot e o reusa depois", async () => {
    const events = fakeEventStore();
    await createTransactionsStore(deps(events)).init();

    const first = await events.getMeta("deviceId");
    await createTransactionsStore(deps(events)).init();

    expect(first).not.toBeNull();
    expect(await events.getMeta("deviceId")).toBe(first);
  });

  it("adiciona um lançamento e o publica na projeção", async () => {
    const events = fakeEventStore();
    const store = createTransactionsStore(deps(events));
    await store.init();

    await store.add(DRAFT);

    const items = listTransactions(store.state.value);
    expect(items).toHaveLength(1);
    expect(items[0]?.description).toBe("Mercado");
    expect(events.events).toHaveLength(1);
    expect(events.events[0]?.action).toBe("create");
  });

  it("edita emitindo apenas o patch recebido", async () => {
    const events = fakeEventStore();
    const store = createTransactionsStore(deps(events));
    await store.init();
    await store.add(DRAFT);
    const [created] = listTransactions(store.state.value);

    await store.edit(created?.id ?? "", { amountMinor: 500 });

    const update = events.events.find((event) => event.action === "update");
    expect(update?.data).toEqual({ amountMinor: 500 });
    expect(listTransactions(store.state.value)[0]?.amountMinor).toBe(500);
    expect(listTransactions(store.state.value)[0]?.description).toBe("Mercado");
  });

  it("remove gravando tombstone", async () => {
    const events = fakeEventStore();
    const store = createTransactionsStore(deps(events));
    await store.init();
    await store.add(DRAFT);
    const [created] = listTransactions(store.state.value);

    await store.remove(created?.id ?? "");

    expect(listTransactions(store.state.value)).toEqual([]);
    expect(events.events.some((event) => event.action === "delete")).toBe(true);
  });

  it("não altera a projeção quando a gravação falha", async () => {
    const events = fakeEventStore();
    const store = createTransactionsStore(deps(events));
    await store.init();
    events.failNext = true;

    await store.add(DRAFT);

    expect(listTransactions(store.state.value)).toEqual([]);
    expect(store.error.value).toBe("quota exceeded");
  });

  it("entra em erro quando o banco não abre", async () => {
    const broken = fakeEventStore();
    broken.readAll = async () => {
      throw new Error("IndexedDB indisponível");
    };
    const store = createTransactionsStore(deps(broken));

    await store.init();

    expect(store.status.value).toBe("error");
    expect(store.error.value).toBe("IndexedDB indisponível");
  });

  it("recupera a projeção e o relógio a partir do log existente", async () => {
    const events = fakeEventStore();
    const first = createTransactionsStore(deps(events));
    await first.init();
    await first.add(DRAFT);

    const second = createTransactionsStore(deps(events));
    await second.init();
    await second.add({ ...DRAFT, description: "Farmácia" });

    expect(listTransactions(second.state.value)).toHaveLength(2);

    // O segundo boot reiniciou o relógio de parede no mesmo instante do primeiro.
    // Se o HLC não viesse do log, o segundo evento nasceria com HLC repetido ou menor.
    const hlcs = events.events.map((event) => event.hlc);
    expect(hlcs).toHaveLength(2);

    const [primeiro = "", segundo = ""] = hlcs;
    expect(segundo > primeiro).toBe(true);
    expect(new Set(hlcs).size).toBe(hlcs.length);
  });
});
