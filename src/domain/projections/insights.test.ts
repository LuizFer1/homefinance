import { describe, expect, it } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Category } from "../model/category";
import type { PaymentMethod } from "../model/payment-method";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import {
  averageSurplus,
  cashbackSummary,
  categoryBreakdown,
  categoryUsage,
  daysInMonth,
  monthComparison,
  spendingPace,
} from "./insights";

function record(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    kind: "expense",
    description: "Mercado",
    amountMinor: 1000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: "2026-09-07",
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
    ...ALIVE,
    ...overrides,
  };
}

function reference(overrides: Partial<Category> & { id: string }): Category {
  return {
    name: "Casa",
    icon: "house",
    color: "amber",
    kind: "expense",
    ...ALIVE,
    ...overrides,
  };
}

function method(overrides: Partial<PaymentMethod> & { id: string }): PaymentMethod {
  return {
    name: "Cartão",
    icon: "credit-card",
    color: "violet",
    kind: "credit",
    ...ALIVE,
    ...overrides,
  };
}

function stateWith(categories: Category[], paymentMethods: PaymentMethod[] = []): AppState {
  return {
    ...EMPTY_APP_STATE,
    categories: Object.fromEntries(categories.map((item) => [item.id, item])),
    paymentMethods: Object.fromEntries(paymentMethods.map((item) => [item.id, item])),
  };
}

describe("daysInMonth", () => {
  it("conhece fevereiro bissexto e os meses de 30", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2026-09")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
  });
});

describe("monthComparison", () => {
  it("compara o saldo do mês com o do anterior", () => {
    const items = [
      record({ id: "a", kind: "income", amountMinor: 10_000, occurredOn: "2026-09-02" }),
      record({ id: "b", amountMinor: 3000, occurredOn: "2026-09-10" }),
      record({ id: "c", kind: "income", amountMinor: 8000, occurredOn: "2026-08-02" }),
      record({ id: "d", amountMinor: 4000, occurredOn: "2026-08-20" }),
    ];

    const result = monthComparison(items, "2026-09");

    expect(result.current).toEqual({ incomeMinor: 10_000, expenseMinor: 3000, balanceMinor: 7000 });
    expect(result.previous.balanceMinor).toBe(4000);
    expect(result.deltaMinor).toBe(3000);
    expect(result.count).toBe(2);
  });

  it("atravessa a virada do ano", () => {
    const items = [record({ id: "a", amountMinor: 500, occurredOn: "2025-12-31" })];

    expect(monthComparison(items, "2026-01").previous.expenseMinor).toBe(500);
  });
});

describe("spendingPace", () => {
  const items = [
    record({ id: "s1", amountMinor: 1000, occurredOn: "2026-09-01" }),
    record({ id: "s2", amountMinor: 2000, occurredOn: "2026-09-10" }),
    record({ id: "s3", amountMinor: 9999, occurredOn: "2026-09-28" }),
    record({ id: "a1", amountMinor: 1500, occurredOn: "2026-08-05" }),
    record({ id: "a2", amountMinor: 2500, occurredOn: "2026-08-20" }),
    record({ id: "a3", amountMinor: 800, occurredOn: "2026-08-31" }),
    // Receita não entra no ritmo de gasto.
    record({ id: "r", kind: "income", amountMinor: 50_000, occurredOn: "2026-09-02" }),
  ];

  it("acumula a despesa dia a dia nos dois meses", () => {
    const pace = spendingPace(items, "2026-09", "2026-09-24");

    expect(pace.current).toHaveLength(30);
    expect(pace.previous).toHaveLength(31);
    expect(pace.current[0]).toBe(1000);
    expect(pace.current[9]).toBe(3000);
    expect(pace.previous[30]).toBe(4800);
  });

  it("no mês corrente corta em hoje e compara no mesmo dia do anterior", () => {
    const pace = spendingPace(items, "2026-09", "2026-09-24");

    expect(pace.cutoff).toBe(24);
    expect(pace.spentMinor).toBe(3000);
    expect(pace.previousAtCutoffMinor).toBe(4000);
    expect(pace.change).toBeCloseTo(-0.25);
  });

  it("num mês passado corta no último dia", () => {
    const pace = spendingPace(items, "2026-08", "2026-09-24");

    expect(pace.cutoff).toBe(31);
    expect(pace.spentMinor).toBe(4800);
  });

  it("sem gasto no anterior não inventa porcentagem", () => {
    const pace = spendingPace(items.slice(0, 3), "2026-09", "2026-09-24");

    expect(pace.change).toBeNull();
  });

  it("dia de corte além do fim do mês anterior usa o último dia dele", () => {
    // 31 de março contra fevereiro de 28 dias.
    const pace = spendingPace(
      [record({ id: "f", amountMinor: 700, occurredOn: "2026-02-28" })],
      "2026-03",
      "2026-03-31",
    );

    expect(pace.previousAtCutoffMinor).toBe(700);
  });
});

describe("categoryBreakdown", () => {
  it("lista todas as categorias de despesa com a parte de cada uma", () => {
    const state = stateWith([
      reference({ id: "moradia", name: "Moradia" }),
      reference({ id: "lazer", name: "Lazer", icon: "film", color: "violet" }),
    ]);
    const items = [
      record({ id: "a", amountMinor: 7500, categoryId: "moradia" }),
      record({ id: "b", amountMinor: 2500, categoryId: "lazer" }),
      record({ id: "c", kind: "income", amountMinor: 99_999, categoryId: "moradia" }),
    ];

    const rows = categoryBreakdown(items, state);

    expect(rows.map((row) => [row.name, row.amountMinor, row.share])).toEqual([
      ["Moradia", 7500, 0.75],
      ["Lazer", 2500, 0.25],
    ]);
    expect(rows[1]?.icon).toBe("film");
  });

  it("junta o que não tem categoria (ou a perdeu) numa linha neutra", () => {
    const state = stateWith([reference({ id: "morta", deletedAt: DELETED_AT })]);
    const items = [
      record({ id: "a", amountMinor: 100, categoryId: null }),
      record({ id: "b", amountMinor: 300, categoryId: "morta" }),
    ];

    const rows = categoryBreakdown(items, state);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: null, name: "Sem categoria", amountMinor: 400 });
  });

  it("não devolve nada sem despesa", () => {
    expect(categoryBreakdown([], EMPTY_APP_STATE)).toEqual([]);
  });
});

describe("cashbackSummary", () => {
  it("soma o cashback e conta as compras no crédito e no débito", () => {
    const state = stateWith(
      [],
      [
        method({ id: "cc", kind: "credit" }),
        method({ id: "cd", kind: "debit" }),
        method({ id: "pix", kind: "pix" }),
      ],
    );
    const items = [
      record({ id: "a", paymentMethodId: "cc", cashbackMinor: 1270 }),
      record({ id: "b", paymentMethodId: "cd", cashbackMinor: null }),
      record({ id: "c", paymentMethodId: "pix" }),
      record({ id: "d", kind: "income", paymentMethodId: "cc", cashbackMinor: null }),
    ];

    expect(cashbackSummary(items, state)).toEqual({ totalMinor: 1270, purchases: 2 });
  });
});

describe("categoryUsage", () => {
  it("conta lançamentos por categoria só no mês pedido", () => {
    const items = [
      record({ id: "a", categoryId: "x", occurredOn: "2026-09-01" }),
      record({ id: "b", categoryId: "x", occurredOn: "2026-09-30" }),
      record({ id: "c", categoryId: "x", occurredOn: "2026-08-30" }),
      record({ id: "d", categoryId: null, occurredOn: "2026-09-02" }),
    ];

    expect(categoryUsage(items, "2026-09", "categoryId")).toEqual({ x: 2 });
  });
});

describe("averageSurplus", () => {
  it("é a média do que sobrou por mês na janela", () => {
    expect(
      averageSurplus([
        { month: "2026-08", incomeMinor: 1000, expenseMinor: 400 },
        { month: "2026-09", incomeMinor: 1000, expenseMinor: 800 },
      ]),
    ).toBe(400);
  });

  it("janela vazia não divide por zero", () => {
    expect(averageSurplus([])).toBe(0);
  });
});
