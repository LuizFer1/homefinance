import { describe, expect, it } from "vitest";
import {
  type CategoryRecord,
  EMPTY_STATE,
  type ProjectionState,
  type TransactionRecord,
} from "./apply";
import {
  findCategory,
  findUser,
  groupByDay,
  listCategories,
  listPaymentMethods,
  listTransactions,
  resolveAuthorColor,
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
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
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
    kind: "expense",
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

describe("autor do lançamento", () => {
  const AUTOR = "01J9F3K2M7QX8YB4TVWZ0DCEHU";
  const AUTOR_APAGADO = "01J9F3K2M7QX8YB4TVWZ0DCEHD";

  const USER_STATE: ProjectionState = {
    ...EMPTY_STATE,
    users: {
      [AUTOR]: {
        id: AUTOR,
        name: "Luiz",
        color: "teal",
        avatar: "data:image/webp;base64,AAAA",
        deleted: false,
        materialized: true,
        fieldHlc: {},
      },
      [AUTOR_APAGADO]: {
        id: AUTOR_APAGADO,
        name: "Ana",
        color: "rose",
        avatar: null,
        deleted: true,
        materialized: true,
        fieldHlc: {},
      },
    },
  };

  it("resolve a cor do autor do lançamento", () => {
    expect(resolveAuthorColor(USER_STATE, AUTOR)).toBe("teal");
  });

  it("lançamento sem autor renderiza a cor neutra", () => {
    // O histórico gravado antes da fatia de perfil é este caso, e ele nunca
    // deixa de existir: o log é eterno.
    expect(resolveAuthorColor(USER_STATE, null)).toBe("slate");
  });

  it("lançamento de autor apagado ou inexistente renderiza a cor neutra", () => {
    expect(resolveAuthorColor(USER_STATE, AUTOR_APAGADO)).toBe("slate");
    expect(resolveAuthorColor(USER_STATE, "01J9F3K2M7QX8YB4TVWZ0DCEXX")).toBe("slate");
  });

  it("findUser devolve o perfil vivo e nulo para os demais casos", () => {
    expect(findUser(USER_STATE, AUTOR)?.name).toBe("Luiz");
    expect(findUser(USER_STATE, null)).toBeNull();
    expect(findUser(USER_STATE, AUTOR_APAGADO)).toBeNull();
    expect(findUser(USER_STATE, "01J9F3K2M7QX8YB4TVWZ0DCEXX")).toBeNull();
  });
});

describe("groupByDay", () => {
  const HOJE = "2026-08-10";
  const ONTEM = "2026-08-09";

  it("junta lancamentos do mesmo dia num grupo so", () => {
    const grupos = groupByDay([
      record({ id: "a", occurredOn: HOJE }),
      record({ id: "b", occurredOn: HOJE }),
      record({ id: "c", occurredOn: ONTEM }),
    ]);

    expect(grupos.map((g) => g.date)).toEqual([HOJE, ONTEM]);
    expect(grupos[0]?.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(grupos[1]?.items.map((i) => i.id)).toEqual(["c"]);
  });

  it("preserva a ordem que listTransactions ja decidiu", () => {
    // Reagrupar por chave num objeto perderia o desempate por id, e os dias
    // pulariam de posicao a cada refold do log.
    const ordenados = listTransactions(
      stateWith({
        a: record({ id: "a", occurredOn: ONTEM }),
        b: record({ id: "b", occurredOn: HOJE }),
        c: record({ id: "c", occurredOn: HOJE }),
      }),
    );

    expect(groupByDay(ordenados).map((g) => g.date)).toEqual([HOJE, ONTEM]);
  });

  it("o subtotal e o saldo do dia, nao a soma bruta", () => {
    const grupos = groupByDay([
      record({ id: "a", occurredOn: HOJE, kind: "income", amountMinor: 300_000 }),
      record({ id: "b", occurredOn: HOJE, kind: "expense", amountMinor: 21_000 }),
    ]);

    expect(grupos[0]?.totals.balanceMinor).toBe(279_000);
    expect(grupos[0]?.totals.incomeMinor).toBe(300_000);
    expect(grupos[0]?.totals.expenseMinor).toBe(21_000);
  });

  it("saldo negativo do dia e normal, nao erro", () => {
    const grupos = groupByDay([record({ id: "a", occurredOn: HOJE, amountMinor: 21_000 })]);

    expect(grupos[0]?.totals.balanceMinor).toBe(-21_000);
  });

  it("lista vazia devolve nenhum grupo", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("findCategory", () => {
  const VIVA_CAT = "01J9F3K2M7QX8YB4TVWZ0DCEC1";
  const MORTA_CAT = "01J9F3K2M7QX8YB4TVWZ0DCEC2";

  const CAT_STATE: ProjectionState = {
    ...EMPTY_STATE,
    categories: {
      [VIVA_CAT]: {
        id: VIVA_CAT,
        name: "Alimentacao",
        icon: "utensils",
        color: "emerald",
        kind: "expense",
        deleted: false,
        materialized: true,
        fieldHlc: {},
      },
      [MORTA_CAT]: {
        id: MORTA_CAT,
        name: "Antiga",
        icon: "tag",
        color: "rose",
        kind: "expense",
        deleted: true,
        materialized: true,
        fieldHlc: {},
      },
    },
  };

  it("devolve icone e cor da categoria viva", () => {
    expect(findCategory(CAT_STATE, VIVA_CAT)).toMatchObject({
      icon: "utensils",
      color: "emerald",
    });
  });

  it("categoria apagada, ausente ou inexistente devolve nulo", () => {
    // O nome tem rotulo neutro para referencia morta; icone e cor de um
    // registro apagado nao devem aparecer.
    expect(findCategory(CAT_STATE, MORTA_CAT)).toBeNull();
    expect(findCategory(CAT_STATE, null)).toBeNull();
    expect(findCategory(CAT_STATE, "01J9F3K2M7QX8YB4TVWZ0DCEXX")).toBeNull();
  });
});
