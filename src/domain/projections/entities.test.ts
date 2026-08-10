import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, ENTITY_SPECS, PAYMENT_METHOD_SPEC, TRANSACTION_SPEC } from "./entities";

const ENTITY = "01J9F3K2M7QX8YB4TVWZ0DCEH2";

describe("ENTITY_SPECS", () => {
  it("registra as quatro entidades projetadas", () => {
    expect(Object.keys(ENTITY_SPECS).sort()).toEqual([
      "category",
      "paymentMethod",
      "transaction",
      "user",
    ]);
  });

  it("não registra entidades ainda não construídas", () => {
    expect(ENTITY_SPECS.investment).toBeUndefined();
    expect(ENTITY_SPECS.reserve).toBeUndefined();
  });

  it("cada spec aponta para um bucket distinto", () => {
    // É esta propriedade que sustenta o único cast de `apply.ts`: um spec com
    // `bucket` errado é o único jeito de furar a garantia estrutural de lá.
    const buckets = Object.values(ENTITY_SPECS).map((spec) => spec?.bucket);

    expect(new Set(buckets).size).toBe(buckets.length);
  });

  it("a casca de toda entidade nasce não materializada e não apagada", () => {
    for (const spec of Object.values(ENTITY_SPECS)) {
      const record = spec?.shell(ENTITY);

      expect(record?.id).toBe(ENTITY);
      expect(record?.materialized).toBe(false);
      expect(record?.deleted).toBe(false);
      expect(record?.fieldHlc).toEqual({});
    }
  });

  it("a casca declara todos os campos que o spec lista", () => {
    // Campo listado sem lugar na casca seria escrito pelo merge e sumiria do
    // tipo; campo na casca fora da lista nunca receberia valor do log.
    for (const spec of Object.values(ENTITY_SPECS)) {
      const record = spec?.shell(ENTITY) as unknown as Record<string, unknown>;

      for (const field of spec?.fields ?? []) {
        expect(record).toHaveProperty(field);
      }
    }
  });
});

describe("isValidField", () => {
  it("rejeita campo fora da lista da entidade", () => {
    expect(TRANSACTION_SPEC.isValidField("cor", "rose")).toBe(false);
  });

  it("aceita forma de pagamento e cashback nulos, que e o estado do historico gravado", () => {
    expect(TRANSACTION_SPEC.isValidField("paymentMethodId", null)).toBe(true);
    expect(TRANSACTION_SPEC.isValidField("cashbackMinor", null)).toBe(true);
  });

  it("cashback e inteiro em centavos, nunca float nem string", () => {
    expect(TRANSACTION_SPEC.isValidField("cashbackMinor", 1234)).toBe(true);
    expect(TRANSACTION_SPEC.isValidField("cashbackMinor", 0)).toBe(true);
    expect(TRANSACTION_SPEC.isValidField("cashbackMinor", 12.34)).toBe(false);
    expect(TRANSACTION_SPEC.isValidField("cashbackMinor", "1234")).toBe(false);
  });

  it("preserva a validação de data real herdada da fatia anterior", () => {
    expect(TRANSACTION_SPEC.isValidField("occurredOn", "2026-02-30")).toBe(false);
    expect(TRANSACTION_SPEC.isValidField("occurredOn", "2026-13-01")).toBe(false);
    expect(TRANSACTION_SPEC.isValidField("occurredOn", "2026-02-28")).toBe(true);
    expect(TRANSACTION_SPEC.isValidField("occurredOn", "2024-02-29")).toBe(true);
  });

  it("aceita qualquer token de cor não vazio, inclusive desconhecido", () => {
    // O log é eterno e sincroniza com aparelhos de versão mais nova: rejeitar
    // aqui apagaria o campo do registro do usuário para sempre. O fallback para
    // neutro é decisão de renderização, e mora na UI.
    expect(PAYMENT_METHOD_SPEC.isValidField("color", "emerald")).toBe(true);
    expect(PAYMENT_METHOD_SPEC.isValidField("color", "chartreuse")).toBe(true);
    expect(PAYMENT_METHOD_SPEC.isValidField("color", "")).toBe(false);
    expect(PAYMENT_METHOD_SPEC.isValidField("color", 42)).toBe(false);
  });

  it("aceita userId nulo, que e o estado do historico ja gravado", () => {
    // O log e eterno: os lancamentos ja gravados neste aparelho nao tem autor,
    // e torna-lo obrigatorio invalidaria o historico existente.
    expect(TRANSACTION_SPEC.isValidField("userId", null)).toBe(true);
    expect(TRANSACTION_SPEC.isValidField("userId", "01J9F3K2M7QX8YB4TVWZ0DCEHU")).toBe(true);
    expect(TRANSACTION_SPEC.isValidField("userId", 42)).toBe(false);
  });

  it("valida kind da forma de pagamento contra a lista fechada", () => {
    // `kind` é diferente de cor e ícone: ele carrega regra de produto (cashback
    // na fatia 3), então um valor fora da lista mudaria comportamento, não só
    // aparência.
    expect(PAYMENT_METHOD_SPEC.isValidField("kind", "credit")).toBe(true);
    expect(PAYMENT_METHOD_SPEC.isValidField("kind", "cash")).toBe(true);
    expect(PAYMENT_METHOD_SPEC.isValidField("kind", "cripto")).toBe(false);
  });
});

describe("COLOR_TOKENS", () => {
  it("declara os doze tokens do roadmap", () => {
    expect(COLOR_TOKENS).toHaveLength(12);
    expect(COLOR_TOKENS[0]).toBe("slate");
  });
});
