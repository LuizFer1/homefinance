import { describe, expect, it } from "vitest";
import {
  type Category,
  categoryCreated,
  categoryDeleted,
  categoryUpdated,
  diffCategory,
  diffPaymentMethod,
  type PaymentMethod,
  paymentMethodCreated,
  paymentMethodDeleted,
  paymentMethodUpdated,
} from "./reference";
import { isValidEvent } from "./validate";

const ENVELOPE = {
  eventId: "01J9F3K2M7QX8YB4TVWZ0DCEH1",
  entityId: "01J9F3K2M7QX8YB4TVWZ0DCEH2",
  deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHR",
  hlc: "1754697600000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHR",
};

const CATEGORY: Category = {
  id: ENVELOPE.entityId,
  name: "Mercado",
  icon: "utensils",
  color: "emerald",
};

const METHOD: PaymentMethod = {
  id: ENVELOPE.entityId,
  name: "Nubank",
  icon: "credit-card",
  color: "violet",
  kind: "credit",
};

describe("construtores de categoria", () => {
  it("create carrega o agregado inteiro", () => {
    const event = categoryCreated({
      ...ENVELOPE,
      draft: { name: "Mercado", icon: "utensils", color: "emerald" },
    });

    expect(event.entity).toBe("category");
    expect(event.action).toBe("create");
    expect(event.entityId).toBe(ENVELOPE.entityId);
    expect(event.schemaVersion).toBe(1);
    expect(event.data).toEqual({ name: "Mercado", icon: "utensils", color: "emerald" });
  });

  it("update carrega apenas o patch", () => {
    const event = categoryUpdated({ ...ENVELOPE, patch: { color: "rose" } });

    expect(event.action).toBe("update");
    expect(event.data).toEqual({ color: "rose" });
  });

  it("delete carrega data vazio", () => {
    const event = categoryDeleted(ENVELOPE);

    expect(event.action).toBe("delete");
    expect(event.data).toEqual({});
  });

  it("não vaza draft nem patch para o evento gravado", () => {
    const event = categoryCreated({
      ...ENVELOPE,
      draft: { name: "Mercado", icon: "utensils", color: "emerald" },
    });

    expect(event).not.toHaveProperty("draft");
    expect(event).not.toHaveProperty("eventId");
    expect(Object.keys(event.data).sort()).toEqual(["color", "icon", "name"]);
  });

  it("produz eventos que passam na guarda de integridade do log", () => {
    // O construtor e o validador são as duas pontas da mesma fronteira. Uma
    // divergência entre eles rejeitaria todo evento legítimo na leitura.
    expect(isValidEvent(categoryCreated({ ...ENVELOPE, draft: CATEGORY }))).toBe(true);
    expect(isValidEvent(categoryUpdated({ ...ENVELOPE, patch: {} }))).toBe(true);
    expect(isValidEvent(categoryDeleted(ENVELOPE))).toBe(true);
  });
});

describe("construtores de forma de pagamento", () => {
  it("create carrega o agregado inteiro, kind incluso", () => {
    const event = paymentMethodCreated({
      ...ENVELOPE,
      draft: { name: "Nubank", icon: "credit-card", color: "violet", kind: "credit" },
    });

    expect(event.entity).toBe("paymentMethod");
    expect(event.data).toEqual({
      name: "Nubank",
      icon: "credit-card",
      color: "violet",
      kind: "credit",
    });
  });

  it("update e delete seguem o mesmo contrato da categoria", () => {
    expect(paymentMethodUpdated({ ...ENVELOPE, patch: { kind: "debit" } }).data).toEqual({
      kind: "debit",
    });
    expect(paymentMethodDeleted(ENVELOPE).data).toEqual({});
  });
});

describe("diffCategory", () => {
  it("devolve apenas os campos alterados", () => {
    expect(diffCategory(CATEGORY, { name: "Feira", icon: "utensils", color: "emerald" })).toEqual({
      name: "Feira",
    });
  });

  it("devolve patch vazio quando nada mudou", () => {
    expect(diffCategory(CATEGORY, { name: "Mercado", icon: "utensils", color: "emerald" })).toEqual(
      {},
    );
  });

  it("não para no primeiro campo alterado", () => {
    expect(diffCategory(CATEGORY, { name: "Feira", icon: "tag", color: "rose" })).toEqual({
      name: "Feira",
      icon: "tag",
      color: "rose",
    });
  });
});

describe("diffPaymentMethod", () => {
  it("inclui kind quando ele muda", () => {
    expect(diffPaymentMethod(METHOD, { ...METHOD, kind: "debit" })).toEqual({ kind: "debit" });
  });

  it("não inclui kind quando ele não muda", () => {
    expect(diffPaymentMethod(METHOD, { ...METHOD, name: "Nu" })).toEqual({ name: "Nu" });
  });

  it("devolve patch vazio quando nada mudou", () => {
    expect(diffPaymentMethod(METHOD, { ...METHOD })).toEqual({});
  });
});
