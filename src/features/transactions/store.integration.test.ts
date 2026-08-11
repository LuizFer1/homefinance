import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HomeFinanceDb } from "../../data/db";
import { createEventStore } from "../../data/event-store";
import type { TransactionDraft } from "../../domain/events/transaction";
import { cryptoRandomChunk } from "../../domain/ids/ulid";
import { listTransactions } from "../../domain/projections/selectors";
import { createSession } from "../session/session";
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
  recurrenceId: null,
  occurrenceKey: null,
};

let db: HomeFinanceDb;
let dbName: string;
let counter = 0;

function build() {
  return createTransactionsStore(
    createSession({
      events: createEventStore(db),
      now: () => Date.now(),
      randomChunk: cryptoRandomChunk,
    }),
  );
}

beforeEach(() => {
  counter += 1;
  dbName = `homefinance-integracao-${counter}`;
  db = new HomeFinanceDb(dbName);
});

afterEach(async () => {
  await db.delete();
});

describe("store sobre Dexie real", () => {
  it("persiste um lançamento e o recupera num boot novo", async () => {
    const primeira = build();
    await primeira.init();
    await primeira.add(DRAFT);
    expect(listTransactions(primeira.state.value)).toHaveLength(1);
    db.close();

    db = new HomeFinanceDb(dbName);
    const segunda = build();
    await segunda.init();

    expect(segunda.status.value).toBe("ready");
    const items = listTransactions(segunda.state.value);
    expect(items).toHaveLength(1);
    expect(items[0]?.description).toBe("Mercado");
    expect(items[0]?.amountMinor).toBe(12_345);
  });

  it("reusa o mesmo deviceId entre boots", async () => {
    const primeira = build();
    await primeira.init();
    const original = await createEventStore(db).getMeta("deviceId");

    const segunda = build();
    await segunda.init();

    expect(original).not.toBeNull();
    expect(await createEventStore(db).getMeta("deviceId")).toBe(original);
  });

  it("sobrevive a evento corrompido no log, mantendo os validos", async () => {
    const primeira = build();
    await primeira.init();
    await primeira.add(DRAFT);
    db.close();

    // Grava lixo direto na tabela, simulando corrupção de storage ou versao antiga.
    db = new HomeFinanceDb(dbName);
    await db.events.put({ id: "lixo", hlc: "ontem" } as never);

    const segunda = build();
    await segunda.init();

    expect(segunda.status.value).toBe("ready");
    expect(listTransactions(segunda.state.value)).toHaveLength(1);
  });
});

describe("forma de pagamento e cashback sobre Dexie real", () => {
  it("os tres campos voltam depois de fechar e reabrir", async () => {
    const primeira = build();
    await primeira.init();
    await primeira.add({
      ...DRAFT,
      categoryId: "cat-1",
      paymentMethodId: "pm-1",
      cashbackMinor: 250,
    });

    db.close();
    db = new HomeFinanceDb(dbName);
    const segunda = build();
    await segunda.init();

    const [voltou] = listTransactions(segunda.state.value);
    expect(voltou?.categoryId).toBe("cat-1");
    expect(voltou?.paymentMethodId).toBe("pm-1");
    expect(voltou?.cashbackMinor).toBe(250);
  });

  it("cashback limpo pela troca de forma nao volta no refold", async () => {
    // A prova de que a limpeza sobreviveu ao log append-only: o null foi gravado
    // como evento, e nao apenas apagado da memoria.
    const store = build();
    await store.init();
    await store.add({ ...DRAFT, paymentMethodId: "pm-cartao", cashbackMinor: 500 });
    const [criado] = listTransactions(store.state.value);

    await store.edit(criado?.id ?? "", { paymentMethodId: "pm-dinheiro", cashbackMinor: null });

    db.close();
    db = new HomeFinanceDb(dbName);
    const reaberta = build();
    await reaberta.init();

    const [voltou] = listTransactions(reaberta.state.value);
    expect(voltou?.cashbackMinor).toBeNull();
    expect(voltou?.paymentMethodId).toBe("pm-dinheiro");
  });

  it("lancamento sem os campos novos continua legivel apos reabrir", async () => {
    const store = build();
    await store.init();
    await store.add(DRAFT);

    db.close();
    db = new HomeFinanceDb(dbName);
    const reaberta = build();
    await reaberta.init();

    const [voltou] = listTransactions(reaberta.state.value);
    expect(voltou?.description).toBe("Mercado");
    expect(voltou?.paymentMethodId).toBeNull();
    expect(voltou?.cashbackMinor).toBeNull();
  });
});
