import { describe, expect, it } from "vitest";
import type { ProjectionState, TransactionRecord } from "./apply";
import { listTransactions, totals } from "./selectors";

function record(overrides: Partial<TransactionRecord> & { id: string }): TransactionRecord {
  return {
    kind: "expense",
    description: "Mercado",
    amountMinor: 1000,
    currency: "BRL",
    categoryId: null,
    occurredOn: "2026-08-07",
    deleted: false,
    materialized: true,
    fieldHlc: {},
    ...overrides,
  };
}

const STATE: ProjectionState = {
  lastHlc: null,
  transactions: {
    a: record({ id: "a", occurredOn: "2026-08-05", amountMinor: 1000 }),
    b: record({ id: "b", occurredOn: "2026-08-09", kind: "income", amountMinor: 5000 }),
    c: record({ id: "c", occurredOn: "2026-08-10", deleted: true }),
    d: record({ id: "d", occurredOn: "2026-08-11", materialized: false }),
  },
};

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
    const umaOrdem: ProjectionState = {
      lastHlc: null,
      transactions: { x: record({ id: "x", ...base }), y: record({ id: "y", ...base }) },
    };
    const outraOrdem: ProjectionState = {
      lastHlc: null,
      transactions: { y: record({ id: "y", ...base }), x: record({ id: "x", ...base }) },
    };

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
