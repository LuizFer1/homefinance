import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HomeFinanceDb } from "../../data/db";
import { createEventStore } from "../../data/event-store";
import type { TransactionDraft } from "../../domain/events/transaction";
import { cryptoRandomChunk } from "../../domain/ids/ulid";
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

let db: HomeFinanceDb;
let dbName: string;
let counter = 0;

function build() {
  return createTransactionsStore({
    events: createEventStore(db),
    now: () => Date.now(),
    randomChunk: cryptoRandomChunk,
  });
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
