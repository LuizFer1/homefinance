import { describe, expect, it } from "vitest";
import { compareHlc, formatHlc, parseHlc } from "../clock/hlc";
import { stableEntityId } from "../ids/stable-id";
import {
  buildDefaultRows,
  DEFAULT_CATEGORIES,
  DEFAULT_METHODS,
  type DefaultCatalog,
  defaultId,
  GENESIS_HLC,
  LEGACY_CREDIT_METHOD_ID,
} from "./defaults";

describe("buildDefaultRows", () => {
  it("é idêntico byte a byte em qualquer aparelho", () => {
    expect(JSON.stringify(buildDefaultRows())).toBe(JSON.stringify(buildDefaultRows()));
  });

  it("monta 12 categorias e 3 formas (sem o cartão genérico), com ids distintos e estáveis", () => {
    const { categories, paymentMethods } = buildDefaultRows();
    expect(categories).toHaveLength(12);
    expect(paymentMethods.map((m) => m.kind)).toEqual(["cash", "pix", "debit"]);
    const ids = [...categories, ...paymentMethods].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(categories[0]?.id).toBe(DEFAULT_CATEGORIES[0]?.id);
    expect(paymentMethods[1]?.id).toBe(DEFAULT_METHODS[1]?.id);
  });

  it("não semeia o cartão de crédito genérico, mas a lista de fusão ainda o conhece", () => {
    const { paymentMethods } = buildDefaultRows();
    expect(paymentMethods.some((m) => m.id === LEGACY_CREDIT_METHOD_ID)).toBe(false);
    // Aparelhos na versão velha ainda semeiam cópias dele: a fusão precisa vê-lo.
    expect(DEFAULT_METHODS.some((m) => m.id === LEGACY_CREDIT_METHOD_ID)).toBe(true);
  });

  it("nasce na gênese, sujo e vivo", () => {
    for (const row of [...buildDefaultRows().categories, ...buildDefaultRows().paymentMethods]) {
      expect(row.updatedAt).toBe(GENESIS_HLC);
      expect(row.deletedAt).toBeNull();
      expect(row.dirty).toBe(1);
      expect(row.mergedInto).toBeNull();
    }
  });
});

describe("GENESIS_HLC", () => {
  it("é um HLC válido abaixo de qualquer escrita real", () => {
    expect(parseHlc(GENESIS_HLC)).not.toBeNull();
    const real = formatHlc({ millis: 1, counter: 0, deviceId: "00000000000000000000000000" });
    expect(compareHlc(GENESIS_HLC, real)).toBeLessThan(0);
  });
});

describe("padrões por conta", () => {
  it("a conta pessoal mantém o id e os bytes de sempre (sem book)", () => {
    expect(defaultId("categories", "food")).toBe(stableEntityId("default:categories:food"));
    for (const row of [
      ...buildDefaultRows().categories,
      ...buildDefaultRows("personal").paymentMethods,
    ]) {
      expect(row).not.toHaveProperty("book");
    }
  });

  it("o id da conta comercial inclui o book e nunca colide com o da pessoal", () => {
    const business = defaultId("categories", "food", "business");
    expect(business).toBe(stableEntityId("default:business:categories:food"));
    expect(business).not.toBe(defaultId("categories", "food"));
  });

  it("a semente comercial traz as categorias e formas de pagamento do comércio, todas da conta", () => {
    const { categories, paymentMethods } = buildDefaultRows("business");
    expect(categories.map((c) => c.name)).toEqual([
      "Vendas",
      "Outras receitas",
      "Fornecedores",
      "Aluguel",
      "Impostos",
      "Funcionários",
      "Marketing",
      "Equipamentos",
      "Contas",
      "Outras despesas",
    ]);
    expect(categories.filter((c) => c.kind === "income").map((c) => c.name)).toEqual([
      "Vendas",
      "Outras receitas",
    ]);
    expect(paymentMethods.map((m) => m.name)).toEqual([
      "Pix",
      "Dinheiro",
      "Cartão de débito",
      "Cartão de crédito",
      "Boleto",
    ]);
    for (const row of [...categories, ...paymentMethods]) {
      expect(row.book).toBe("business");
      expect(row.updatedAt).toBe(GENESIS_HLC);
    }
  });

  it("os ids comerciais são estáveis, únicos e nunca colidem com os da pessoal", () => {
    const first = buildDefaultRows("business");
    const again = buildDefaultRows("business");
    expect(again).toEqual(first);

    const personal = buildDefaultRows("personal");
    const business = [...first.categories, ...first.paymentMethods].map((r) => r.id);
    const mine = [...personal.categories, ...personal.paymentMethods].map((r) => r.id);
    expect(new Set(business).size).toBe(business.length);
    expect(business.filter((id) => mine.includes(id))).toEqual([]);
  });

  it("aceita um catálogo e estampa o book nas linhas da semente", () => {
    const catalog: DefaultCatalog = {
      categories: [
        {
          id: defaultId("categories", "sales", "business"),
          draft: { name: "Vendas", icon: "banknote", color: "emerald", kind: "income" },
        },
      ],
      methods: [],
    };
    const { categories } = buildDefaultRows("business", catalog);
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({
      id: defaultId("categories", "sales", "business"),
      book: "business",
      updatedAt: GENESIS_HLC,
      dirty: 1,
    });
  });
});
