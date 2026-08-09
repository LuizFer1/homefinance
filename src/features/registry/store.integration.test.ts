import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HomeFinanceDb } from "../../data/db";
import { createEventStore } from "../../data/event-store";
import { cryptoRandomChunk } from "../../domain/ids/ulid";
import {
  listCategories,
  listPaymentMethods,
  listTransactions,
  resolveCategoryName,
} from "../../domain/projections/selectors";
import { createSession, type Session } from "../session/session";
import { createTransactionsStore } from "../transactions/store";
import { createRegistryStore, type RegistryStore } from "./store";

const CATEGORY = { name: "Mercado", icon: "utensils", color: "emerald" } as const;
const METHOD = { name: "Nubank", icon: "credit-card", color: "violet", kind: "credit" } as const;

let db: HomeFinanceDb;
let dbName: string;
let counter = 0;

function build(): { session: Session; registry: RegistryStore } {
  const session = createSession({
    events: createEventStore(db),
    now: () => Date.now(),
    randomChunk: cryptoRandomChunk,
  });
  return { session, registry: createRegistryStore(session) };
}

/** Fecha e reabre o banco: é o que separa "está na memória" de "está no disco". */
async function reopen() {
  db.close();
  db = new HomeFinanceDb(dbName);
}

beforeEach(() => {
  counter += 1;
  dbName = `homefinance-registry-${counter}`;
  db = new HomeFinanceDb(dbName);
});

afterEach(async () => {
  await db.delete();
});

describe("registry sobre Dexie real", () => {
  it("categoria e forma de pagamento sobrevivem ao fechar e reabrir", async () => {
    const primeiro = build();
    await primeiro.session.init();
    await primeiro.registry.addCategory(CATEGORY);
    await primeiro.registry.addPaymentMethod(METHOD);

    await reopen();
    const segundo = build();
    await segundo.session.init();

    expect(listCategories(segundo.session.state.value).map((c) => c.name)).toEqual(["Mercado"]);
    const metodos = listPaymentMethods(segundo.session.state.value);
    expect(metodos[0]?.name).toBe("Nubank");
    expect(metodos[0]?.kind).toBe("credit");
  });

  it("reusa o mesmo deviceId entre sessões", async () => {
    const primeiro = build();
    await primeiro.session.init();
    await primeiro.registry.addCategory(CATEGORY);
    const antes = primeiro.session.clock().deviceId;

    await reopen();
    const segundo = build();
    await segundo.session.init();

    expect(segundo.session.clock().deviceId).toBe(antes);
  });

  it("apagar categoria referenciada deixa o lançamento vivo depois de reabrir", async () => {
    // A prova de ponta a ponta de que delete não cascateia: o lançamento
    // continua no disco apontando para um registro deletado, e a tela resolve
    // isso em rótulo neutro em vez de sumir com ele.
    const primeiro = build();
    await primeiro.session.init();
    const transactions = createTransactionsStore(primeiro.session);
    await primeiro.registry.addCategory(CATEGORY);
    const [categoria] = listCategories(primeiro.session.state.value);
    const categoryId = categoria?.id ?? "";
    await transactions.add({
      kind: "expense",
      description: "Compra",
      amountMinor: 1000,
      currency: "BRL",
      categoryId,
      occurredOn: "2026-08-07",
    });
    await primeiro.registry.removeCategory(categoryId);

    await reopen();
    const segundo = build();
    await segundo.session.init();

    const lancamentos = listTransactions(segundo.session.state.value);
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0]?.categoryId).toBe(categoryId);
    expect(listCategories(segundo.session.state.value)).toEqual([]);
    expect(resolveCategoryName(segundo.session.state.value, categoryId)).toBe("Categoria removida");
  });

  it("edição por patch preserva os campos não tocados após reabrir", async () => {
    const primeiro = build();
    await primeiro.session.init();
    await primeiro.registry.addCategory(CATEGORY);
    const [criada] = listCategories(primeiro.session.state.value);
    await primeiro.registry.editCategory(criada?.id ?? "", { color: "rose" });

    await reopen();
    const segundo = build();
    await segundo.session.init();

    const [voltou] = listCategories(segundo.session.state.value);
    expect(voltou?.color).toBe("rose");
    expect(voltou?.name).toBe("Mercado");
    expect(voltou?.icon).toBe("utensils");
  });
});
