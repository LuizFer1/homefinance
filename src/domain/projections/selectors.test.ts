import { describe, expect, it } from "vitest";
import {
  type CategoryRecord,
  EMPTY_STATE,
  type ProjectionState,
  type TransactionRecord,
} from "./apply";
import {
  listCategories,
  listPaymentMethods,
  listTransactions,
  resolveCategoryName,
  resolvePaymentMethodName,
  totals,
} from "./selectors";

/** Parte de EMPTY_STATE: bucket novo na projeção não obriga a tocar cada literal daqui. */
function stateWith(transactions: Record<string, TransactionRecord>): ProjectionState {
  return { ...EMPTY_STATE, transactions };
}

function record(overrides: Partial<TransactionRecord> & { id: string }): TransactionRecord {
  return {
    kind: "expense",
    description: "Mercado",
    amountMinor: 1000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: "2026-08-07",
    deleted: false,
    materialized: true,
    fieldHlc: {},
    ...overrides,
  };
}

const STATE: ProjectionState = stateWith({
  a: record({ id: "a", occurredOn: "2026-08-05", amountMinor: 1000 }),
  b: record({ id: "b", occurredOn: "2026-08-09", kind: "income", amountMinor: 5000 }),
  c: record({ id: "c", occurredOn: "2026-08-10", deleted: true }),
  d: record({ id: "d", occurredOn: "2026-08-11", materialized: false }),
});

describe("listTransactions", () => {
  it("esconde tombstones e registros não materializados", () => {
    expect(listTransactions(STATE).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("ordena por data do fato, mais recente primeiro", () => {
    const [first] = listTransactions(STATE);

    expect(first?.occurredOn).toBe("2026-08-09");
  });

  it("desempata por id quando a data é igual, sem depender da ordem de inserção", () => {
    const base = { occurredOn: "2026-08-05" };
    const umaOrdem = stateWith({
      x: record({ id: "x", ...base }),
      y: record({ id: "y", ...base }),
    });
    const outraOrdem = stateWith({
      y: record({ id: "y", ...base }),
      x: record({ id: "x", ...base }),
    });

    expect(listTransactions(umaOrdem).map((item) => item.id)).toEqual(
      listTransactions(outraOrdem).map((item) => item.id),
    );
  });
});

describe("totals", () => {
  it("soma receitas e despesas em centavos", () => {
    expect(totals(listTransactions(STATE))).toEqual({
      incomeMinor: 5000,
      expenseMinor: 1000,
      balanceMinor: 4000,
    });
  });

  it("devolve zeros para lista vazia", () => {
    expect(totals([])).toEqual({ incomeMinor: 0, expenseMinor: 0, balanceMinor: 0 });
  });

  it("cashback nao entra no saldo nem nas despesas", () => {
    // O cashback e atributo da despesa, nao receita. Somar ao saldo exigiria
    // decidir quando o dinheiro entra de fato, o que varia por emissor e nao e
    // observavel pelo app. Este teste deve passar SEM tocar em `totals` — se
    // ele obrigar uma mudanca la, alguem somou cashback em algum lugar.
    const soma = totals([record({ id: "a", amountMinor: 10_000, cashbackMinor: 500 })]);

    expect(soma.expenseMinor).toBe(10_000);
    expect(soma.balanceMinor).toBe(-10_000);
    expect(soma.incomeMinor).toBe(0);
  });

  it("devolve saldo negativo quando a despesa supera a receita", () => {
    const records = [
      record({ id: "a", amountMinor: 9000 }),
      record({ id: "b", kind: "income", amountMinor: 2000 }),
    ];

    expect(totals(records)).toEqual({
      incomeMinor: 2000,
      expenseMinor: 9000,
      balanceMinor: -7000,
    });
  });
});

function categoria(overrides: Partial<CategoryRecord> & { id: string }): CategoryRecord {
  return {
    name: "Mercado",
    icon: "tag",
    color: "slate",
    deleted: false,
    materialized: true,
    fieldHlc: {},
    ...overrides,
  };
}

const VIVA = "01J9F3K2M7QX8YB4TVWZ0DCEC1";
const APAGADA = "01J9F3K2M7QX8YB4TVWZ0DCEC2";
const CASCA = "01J9F3K2M7QX8YB4TVWZ0DCEC3";

const REF_STATE: ProjectionState = {
  ...EMPTY_STATE,
  categories: {
    [VIVA]: categoria({ id: VIVA, name: "Mercado" }),
    [APAGADA]: categoria({ id: APAGADA, name: "Antiga", deleted: true }),
    [CASCA]: categoria({ id: CASCA, name: "", materialized: false }),
  },
  paymentMethods: {
    [VIVA]: { ...categoria({ id: VIVA, name: "Nubank" }), kind: "credit" },
    [APAGADA]: { ...categoria({ id: APAGADA, name: "Antigo", deleted: true }), kind: "debit" },
  },
};

describe("listCategories", () => {
  it("esconde apagadas e não materializadas", () => {
    expect(listCategories(REF_STATE).map((c) => c.id)).toEqual([VIVA]);
  });

  it("ordena por nome", () => {
    const state: ProjectionState = {
      ...EMPTY_STATE,
      categories: {
        z: categoria({ id: "z", name: "Zoológico" }),
        a: categoria({ id: "a", name: "Água" }),
        m: categoria({ id: "m", name: "Mercado" }),
      },
    };

    expect(listCategories(state).map((c) => c.name)).toEqual(["Água", "Mercado", "Zoológico"]);
  });

  it("desempata nome igual por id, sem depender da ordem de inserção", () => {
    // Sem o desempate a lista pula de posição a cada refold.
    const uma: ProjectionState = {
      ...EMPTY_STATE,
      categories: { x: categoria({ id: "x" }), y: categoria({ id: "y" }) },
    };
    const outra: ProjectionState = {
      ...EMPTY_STATE,
      categories: { y: categoria({ id: "y" }), x: categoria({ id: "x" }) },
    };

    expect(listCategories(uma).map((c) => c.id)).toEqual(listCategories(outra).map((c) => c.id));
  });
});

describe("listPaymentMethods", () => {
  it("esconde apagadas e preserva o kind", () => {
    expect(listPaymentMethods(REF_STATE).map((m) => m.kind)).toEqual(["credit"]);
  });
});

describe("resolveCategoryName", () => {
  it("resolve o nome da categoria viva", () => {
    expect(resolveCategoryName(REF_STATE, VIVA)).toBe("Mercado");
  });

  it("resolve 'Sem categoria' para null", () => {
    // Opção legítima, não estado de erro: lançamento rápido continua rápido.
    expect(resolveCategoryName(REF_STATE, null)).toBe("Sem categoria");
  });

  it("resolve rótulo neutro para categoria apagada", () => {
    // Apagar categoria não cascateia, então lançamento apontando para registro
    // deletado é estado normal e permanente — não erro.
    expect(resolveCategoryName(REF_STATE, APAGADA)).toBe("Categoria removida");
  });

  it("resolve rótulo neutro para id que nunca existiu", () => {
    expect(resolveCategoryName(REF_STATE, "01J9F3K2M7QX8YB4TVWZ0DCEXX")).toBe("Categoria removida");
  });

  it("nunca devolve o id cru, que vazaria ULID na tela e no CSV", () => {
    for (const id of [APAGADA, CASCA, "01J9F3K2M7QX8YB4TVWZ0DCEXX"]) {
      expect(resolveCategoryName(REF_STATE, id)).not.toContain(id);
    }
  });
});

describe("resolvePaymentMethodName", () => {
  it("resolve nome, ausência e referência morta", () => {
    expect(resolvePaymentMethodName(REF_STATE, VIVA)).toBe("Nubank");
    expect(resolvePaymentMethodName(REF_STATE, null)).toBe("Sem forma de pagamento");
    expect(resolvePaymentMethodName(REF_STATE, APAGADA)).toBe("Forma removida");
  });
});
