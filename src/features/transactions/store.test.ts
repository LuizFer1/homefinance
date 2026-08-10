import { describe, expect, it } from "vitest";
import { type FakeEventStore, fakeEventStore } from "../../data/event-store.fake";
import type { TransactionDraft } from "../../domain/events/transaction";
import { listTransactions } from "../../domain/projections/selectors";
import { createSession, LOCAL_USER_ID_KEY } from "../session/session";
import { createTransactionsStore } from "./store";

const DRAFT: TransactionDraft = {
  kind: "expense",
  description: "Mercado",
  amountMinor: 12_345,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-08-07",
};

function deps(events: FakeEventStore, startAt = 1_754_697_600_000) {
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

/** A store não constrói mais relógio nem projeção: os dois vêm da sessão. */
function session(events: FakeEventStore, startAt = 1_754_697_600_000) {
  return createSession(deps(events, startAt));
}

describe("createTransactionsStore", () => {
  it("fica pronta num banco vazio", async () => {
    const store = createTransactionsStore(session(fakeEventStore()));

    await store.init();

    expect(store.status.value).toBe("ready");
    expect(listTransactions(store.state.value)).toEqual([]);
  });

  it("grava o deviceId no primeiro boot e o reusa depois", async () => {
    const events = fakeEventStore();
    await createTransactionsStore(session(events)).init();

    const first = await events.getMeta("deviceId");
    await createTransactionsStore(session(events)).init();

    expect(first).not.toBeNull();
    expect(await events.getMeta("deviceId")).toBe(first);
  });

  it("adiciona um lançamento e o publica na projeção", async () => {
    const events = fakeEventStore();
    const store = createTransactionsStore(session(events));
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
    const store = createTransactionsStore(session(events));
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
    const store = createTransactionsStore(session(events));
    await store.init();
    await store.add(DRAFT);
    const [created] = listTransactions(store.state.value);

    await store.remove(created?.id ?? "");

    expect(listTransactions(store.state.value)).toEqual([]);
    expect(events.events.some((event) => event.action === "delete")).toBe(true);
  });

  it("não altera a projeção quando a gravação falha", async () => {
    const events = fakeEventStore();
    const store = createTransactionsStore(session(events));
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
    const store = createTransactionsStore(session(broken));

    await store.init();

    expect(store.status.value).toBe("error");
    expect(store.error.value).toBe("IndexedDB indisponível");
  });

  it("recupera a projeção e o relógio a partir do log existente", async () => {
    const events = fakeEventStore();
    const first = createTransactionsStore(session(events));
    await first.init();
    await first.add(DRAFT);

    const second = createTransactionsStore(session(events));
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

describe("autoria", () => {
  it("preenche userId no create a partir do localUserId", async () => {
    const events = fakeEventStore();
    await events.setMeta(LOCAL_USER_ID_KEY, "01J9F3K2M7QX8YB4TVWZ0DCEHU");
    const store = createTransactionsStore(session(events));
    await store.init();

    await store.add(DRAFT);

    expect(events.events.at(-1)?.data).toMatchObject({
      userId: "01J9F3K2M7QX8YB4TVWZ0DCEHU",
    });
  });

  it("grava autor nulo quando o aparelho ainda nao tem perfil", async () => {
    // O historico gravado antes desta fatia e este caso, e ele nunca deixa de
    // existir: o log e eterno.
    const events = fakeEventStore();
    const store = createTransactionsStore(session(events));
    await store.init();

    await store.add(DRAFT);

    expect(events.events.at(-1)?.data).toMatchObject({ userId: null });
  });

  it("update nao altera userId, nem quando quem edita e outro perfil", async () => {
    // Se sua esposa corrige o valor de um lancamento seu, ele continua seu. Um
    // update que reescrevesse userId faria a autoria virar "quem mexeu por
    // ultimo", que e outra coisa.
    const events = fakeEventStore();
    await events.setMeta(LOCAL_USER_ID_KEY, "01J9F3K2M7QX8YB4TVWZ0DCEHU");
    const store = createTransactionsStore(session(events));
    await store.init();
    await store.add(DRAFT);
    const criado = listTransactions(store.state.value)[0];

    await events.setMeta(LOCAL_USER_ID_KEY, "01J9F3K2M7QX8YB4TVWZ0DCEHO");
    await store.edit(criado?.id ?? "", { amountMinor: 999 });

    expect(events.events.at(-1)?.data).not.toHaveProperty("userId");
    expect(listTransactions(store.state.value)[0]?.userId).toBe("01J9F3K2M7QX8YB4TVWZ0DCEHU");
  });
});
