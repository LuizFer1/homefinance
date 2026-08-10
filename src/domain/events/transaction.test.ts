import { describe, expect, it } from "vitest";
import {
  diffTransaction,
  type Transaction,
  type TransactionDraft,
  transactionCreated,
  transactionDeleted,
  transactionUpdated,
} from "./transaction";

const ENVELOPE = {
  eventId: "01J9F3K2M7QX8YB4TVWZ0DCEH1",
  entityId: "01J9F3K2M7QX8YB4TVWZ0DCEH2",
  deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHR",
  hlc: "1754697600000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHR",
};

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

const CURRENT: Transaction = { id: ENVELOPE.entityId, ...DRAFT };

describe("construtores de evento", () => {
  it("create carrega o agregado inteiro", () => {
    const event = transactionCreated({
      ...ENVELOPE,
      draft: {
        kind: "expense",
        description: "Mercado",
        amountMinor: 12_345,
        currency: "BRL",
        categoryId: null,
        paymentMethodId: null,
        cashbackMinor: null,
        occurredOn: "2026-08-07",
      },
    });

    expect(event.entity).toBe("transaction");
    expect(event.action).toBe("create");
    expect(event.entityId).toBe(ENVELOPE.entityId);
    expect(event.schemaVersion).toBe(1);
    expect(event.data).toEqual({
      kind: "expense",
      description: "Mercado",
      amountMinor: 12_345,
      currency: "BRL",
      categoryId: null,
      paymentMethodId: null,
      cashbackMinor: null,
      occurredOn: "2026-08-07",
    });
  });

  it("update carrega apenas o patch", () => {
    const event = transactionUpdated({ ...ENVELOPE, patch: { amountMinor: 999 } });

    expect(event.action).toBe("update");
    expect(event.data).toEqual({ amountMinor: 999 });
  });

  it("delete carrega data vazio", () => {
    const event = transactionDeleted(ENVELOPE);

    expect(event.action).toBe("delete");
    expect(event.data).toEqual({});
  });
});

describe("diffTransaction", () => {
  it("devolve apenas os campos alterados", () => {
    const patch = diffTransaction(CURRENT, {
      kind: "expense",
      description: "Mercado",
      amountMinor: 500,
      currency: "BRL",
      categoryId: null,
      paymentMethodId: null,
      cashbackMinor: null,
      occurredOn: "2026-08-07",
    });

    expect(patch).toEqual({ amountMinor: 500 });
  });

  it("devolve patch vazio quando nada mudou", () => {
    const patch = diffTransaction(CURRENT, DRAFT);

    expect(patch).toEqual({});
  });

  it("detecta mudança de categoryId nos dois sentidos", () => {
    const categoryId = "01J9F3K2M7QX8YB4TVWZ0DCEC1";
    const comCategoria: Transaction = { ...CURRENT, categoryId };

    expect(diffTransaction(CURRENT, { ...DRAFT, categoryId })).toEqual({ categoryId });
    expect(diffTransaction(comCategoria, DRAFT)).toEqual({ categoryId: null });
  });

  it("devolve todos os campos alterados, não só o primeiro", () => {
    const patch = diffTransaction(CURRENT, {
      ...DRAFT,
      kind: "income",
      description: "Salário",
      amountMinor: 500,
      occurredOn: "2026-08-09",
    });

    expect(patch).toEqual({
      kind: "income",
      description: "Salário",
      amountMinor: 500,
      occurredOn: "2026-08-09",
    });
  });
});

describe("campos de forma de pagamento e cashback", () => {
  it("diff emite null quando o cashback e limpo", () => {
    // A metade que importa da regra: esconder o campo sem gravar a limpeza
    // deixaria dado sujo permanente no log append-only.
    const patch = diffTransaction(
      { ...CURRENT, cashbackMinor: 500 },
      { ...DRAFT, cashbackMinor: null },
    );

    expect(patch).toEqual({ cashbackMinor: null });
  });

  it("diff emite a forma de pagamento quando ela muda", () => {
    const patch = diffTransaction(CURRENT, { ...DRAFT, paymentMethodId: "pm-9" });

    expect(patch).toEqual({ paymentMethodId: "pm-9" });
  });

  it("diff nao emite os campos novos quando so a descricao muda", () => {
    const patch = diffTransaction(CURRENT, { ...DRAFT, description: "Outra" });

    expect(patch).toEqual({ description: "Outra" });
  });

  it("create carrega os dois campos novos", () => {
    const event = transactionCreated({
      ...ENVELOPE,
      draft: { ...DRAFT, paymentMethodId: "pm-1", cashbackMinor: 250 },
    });

    expect(event.data.paymentMethodId).toBe("pm-1");
    expect(event.data.cashbackMinor).toBe(250);
  });
});
