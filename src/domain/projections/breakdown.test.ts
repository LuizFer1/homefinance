import { describe, expect, it } from "vitest";
import {
  type CategoryRecord,
  EMPTY_STATE,
  type ProjectionState,
  type TransactionRecord,
} from "./apply";
import { expenseByCategory, filterByMonth, monthlyTotals } from "./breakdown";

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

function category(overrides: Partial<CategoryRecord> & { id: string }): CategoryRecord {
  return {
    name: "Casa",
    icon: "house",
    color: "rose",
    deleted: false,
    materialized: true,
    fieldHlc: {},
    ...overrides,
  };
}

function stateWith(categories: CategoryRecord[]): ProjectionState {
  return {
    ...EMPTY_STATE,
    categories: Object.fromEntries(categories.map((item) => [item.id, item])),
  };
}

describe("filterByMonth", () => {
  it("guarda só o mês pedido", () => {
    const items = [
      record({ id: "a", occurredOn: "2026-08-01" }),
      record({ id: "b", occurredOn: "2026-07-31" }),
      record({ id: "c", occurredOn: "2026-09-01" }),
    ];

    expect(filterByMonth(items, "2026-08").map((item) => item.id)).toEqual(["a"]);
  });
});

describe("expenseByCategory", () => {
  it("ignora receita", () => {
    // Somar receita numa rosca de gasto responderia outra pergunta.
    const state = stateWith([category({ id: "c1" })]);
    const items = [
      record({ id: "a", categoryId: "c1", amountMinor: 500 }),
      record({ id: "b", categoryId: "c1", amountMinor: 9000, kind: "income" }),
    ];

    expect(expenseByCategory(items, state)).toEqual([
      { key: "c1", name: "Casa", color: "rose", amountMinor: 500 },
    ]);
  });

  it("soma por categoria e ordena do maior para o menor", () => {
    const state = stateWith([
      category({ id: "c1", name: "Casa", color: "rose" }),
      category({ id: "c2", name: "Comida", color: "lime" }),
    ]);
    const items = [
      record({ id: "a", categoryId: "c1", amountMinor: 100 }),
      record({ id: "b", categoryId: "c2", amountMinor: 900 }),
      record({ id: "c", categoryId: "c1", amountMinor: 200 }),
    ];

    expect(expenseByCategory(items, state)).toEqual([
      { key: "c2", name: "Comida", color: "lime", amountMinor: 900 },
      { key: "c1", name: "Casa", color: "rose", amountMinor: 300 },
    ]);
  });

  it("junta os sem categoria num balde neutro", () => {
    const items = [record({ id: "a", categoryId: null, amountMinor: 400 })];

    expect(expenseByCategory(items, EMPTY_STATE)).toEqual([
      { key: "sem-categoria", name: "Sem categoria", color: "slate", amountMinor: 400 },
    ]);
  });

  it("mantém o gasto de categoria apagada, com rótulo neutro", () => {
    // Apagar categoria não cascateia: o gasto aconteceu e some da rosca seria
    // mentir sobre o total do mês.
    const state = stateWith([category({ id: "c1", deleted: true })]);
    const items = [record({ id: "a", categoryId: "c1", amountMinor: 700 })];

    expect(expenseByCategory(items, state)).toEqual([
      { key: "c1", name: "Categoria removida", color: "slate", amountMinor: 700 },
    ]);
  });

  it("não agrupa com exatamente seis categorias", () => {
    // No limite, mostrar as seis é melhor que mostrar cinco e um "Outras" de
    // uma categoria só.
    const state = stateWith(
      [1, 2, 3, 4, 5, 6].map((n) => category({ id: `c${n}`, name: `Cat ${n}` })),
    );
    const items = [1, 2, 3, 4, 5, 6].map((n) =>
      record({ id: `t${n}`, categoryId: `c${n}`, amountMinor: n * 1000 }),
    );

    const slices = expenseByCategory(items, state);

    expect(slices).toHaveLength(6);
    expect(slices.map((slice) => slice.key)).not.toContain("outras");
  });

  it("agrupa o excedente em Outras a partir de sete", () => {
    const state = stateWith(
      [1, 2, 3, 4, 5, 6, 7].map((n) => category({ id: `c${n}`, name: `Cat ${n}` })),
    );
    const amounts = [7000, 6000, 5000, 4000, 3000, 900, 100];
    const items = amounts.map((amount, index) =>
      record({ id: `t${index}`, categoryId: `c${index + 1}`, amountMinor: amount }),
    );

    const slices = expenseByCategory(items, state);

    expect(slices).toHaveLength(6);
    expect(slices.map((slice) => slice.amountMinor)).toEqual([7000, 6000, 5000, 4000, 3000, 1000]);
    expect(slices[5]).toEqual({
      key: "outras",
      name: "Outras",
      color: "slate",
      amountMinor: 1000,
    });
  });
});

describe("monthlyTotals", () => {
  it("preenche com zero o mês sem lançamento", () => {
    // Sem o zero-fill o mês vazio some do array, as barras vizinhas encostam e
    // o eixo passa a mentir sobre o intervalo mostrado.
    const items = [
      record({ id: "a", occurredOn: "2026-06-10", amountMinor: 300 }),
      record({ id: "b", occurredOn: "2026-08-10", amountMinor: 500, kind: "income" }),
    ];

    expect(monthlyTotals(items, ["2026-06", "2026-07", "2026-08"])).toEqual([
      { month: "2026-06", incomeMinor: 0, expenseMinor: 300 },
      { month: "2026-07", incomeMinor: 0, expenseMinor: 0 },
      { month: "2026-08", incomeMinor: 500, expenseMinor: 0 },
    ]);
  });

  it("descarta lançamento fora da janela pedida", () => {
    const items = [record({ id: "a", occurredOn: "2020-01-10", amountMinor: 999 })];

    expect(monthlyTotals(items, ["2026-08"])).toEqual([
      { month: "2026-08", incomeMinor: 0, expenseMinor: 0 },
    ]);
  });
});
