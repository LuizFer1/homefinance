import { describe, expect, it } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Category } from "../model/category";
import type { PaymentMethod } from "../model/payment-method";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { monthlyTotals } from "./breakdown";
import { GRAFITE_TODAY, grafiteState } from "./grafite.fake";
import {
  averageSurplus,
  cashbackSummary,
  categoryBreakdown,
  categoryUsage,
  daysInMonth,
  firstMonthOf,
  monthComparison,
  spendingPace,
} from "./insights";
import { lastMonths } from "./periods";
import { listTransactions } from "./selectors";

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
  // Setembro contra o normal de junho, julho e agosto (o primeiro lançamento é de junho).
  const items = [
    record({ id: "s1", amountMinor: 1000, occurredOn: "2026-09-01" }),
    record({ id: "s2", amountMinor: 2000, occurredOn: "2026-09-10" }),
    record({ id: "s3", amountMinor: 9999, occurredOn: "2026-09-28" }),
    record({ id: "a1", amountMinor: 1500, occurredOn: "2026-08-05" }),
    record({ id: "a2", amountMinor: 2500, occurredOn: "2026-08-20" }),
    record({ id: "a3", amountMinor: 800, occurredOn: "2026-08-31" }),
    record({ id: "j1", amountMinor: 3000, occurredOn: "2026-07-03" }),
    record({ id: "j2", amountMinor: 1000, occurredOn: "2026-07-24" }),
    record({ id: "u1", amountMinor: 500, occurredOn: "2026-06-15" }),
    // Receita não entra no ritmo de gasto.
    record({ id: "r", kind: "income", amountMinor: 50_000, occurredOn: "2026-09-02" }),
  ];

  it("acumula a despesa dia a dia e o normal é a média dos 3 anteriores no mesmo dia", () => {
    const pace = spendingPace(items, "2026-09", "2026-09-24");

    expect(pace.referenceMonths).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(pace.current).toHaveLength(30);
    // O normal acompanha os dias do mês escolhido.
    expect(pace.normal).toHaveLength(30);
    expect(pace.current[0]).toBe(1000);
    expect(pace.current[9]).toBe(3000);
    expect(pace.normal[0]).toBe(0);
    // Dia 24: (500 + 4000 + 4000) / 3 = 2833,33.
    expect(pace.normal[23]).toBe(2833);
  });

  it("no mês corrente corta em hoje e compara com o normal do mesmo dia", () => {
    const pace = spendingPace(items, "2026-09", "2026-09-24");

    expect(pace.cutoff).toBe(24);
    expect(pace.spentMinor).toBe(3000);
    expect(pace.normalAtCutoffMinor).toBe(2833);
    expect(pace.change).toBeCloseTo(3000 / 2833 - 1);
    expect(pace.changePercent).toBe(6);
  });

  it("num mês passado corta no último dia", () => {
    const pace = spendingPace(items, "2026-08", "2026-09-24");

    expect(pace.cutoff).toBe(31);
    expect(pace.spentMinor).toBe(4800);
    // Maio é anterior ao primeiro lançamento: o normal de agosto é junho e julho.
    expect(pace.referenceMonths).toEqual(["2026-06", "2026-07"]);
    // Dia 31: junho (30 dias) vale o dia 30 = 500; julho = 4000.
    expect(pace.normalAtCutoffMinor).toBe(2250);
  });

  it("sem gasto no normal não inventa porcentagem", () => {
    const pace = spendingPace(
      [
        ...items.slice(0, 3),
        record({ id: "ra", kind: "income", amountMinor: 1000, occurredOn: "2026-08-02" }),
      ],
      "2026-09",
      "2026-09-24",
    );

    expect(pace.referenceMonths).toEqual(["2026-08"]);
    expect(pace.normalAtCutoffMinor).toBe(0);
    expect(pace.change).toBeNull();
    expect(pace.changePercent).toBeNull();
  });

  it("dia de corte além do fim de um mês de referência usa o último dia dele", () => {
    // 31 de março contra fevereiro de 28 dias.
    const pace = spendingPace(
      [record({ id: "f", amountMinor: 700, occurredOn: "2026-02-28" })],
      "2026-03",
      "2026-03-31",
    );

    expect(pace.normalAtCutoffMinor).toBe(700);
  });

  it("divide só pelos meses com dado", () => {
    // Primeiro lançamento em agosto: junho e julho não existiam e não puxam o normal para baixo.
    const pace = spendingPace(items.slice(0, 6), "2026-09", "2026-09-24");

    expect(pace.referenceMonths).toEqual(["2026-08"]);
    expect(pace.normalAtCutoffMinor).toBe(4000);
    expect(pace.changePercent).toBe(-25);
  });

  it("mês sem gasto depois do primeiro lançamento conta como zero", () => {
    // Julho existe (é depois de junho) e não gastou nada: entra na média valendo zero.
    const pace = spendingPace(
      [...items.slice(0, 6), items[8] as Transaction],
      "2026-09",
      "2026-09-24",
    );

    expect(pace.referenceMonths).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(pace.normalAtCutoffMinor).toBe(1500);
  });

  it("sem mês de referência não compara", () => {
    const pace = spendingPace(items.slice(0, 3), "2026-09", "2026-09-24");

    expect(pace.referenceMonths).toEqual([]);
    expect(pace.normal).toEqual([]);
    expect(pace.normalAtCutoffMinor).toBeNull();
    expect(pace.change).toBeNull();
    expect(pace.changePercent).toBeNull();
  });

  it("lançamento marcado também define o primeiro mês", () => {
    // Mesma regra do custo essencial: o histórico começa no primeiro lançamento vivo,
    // conte ele nos totais ou não.
    const pace = spendingPace(
      [
        ...items.slice(0, 6),
        record({ id: "t", amountMinor: 9000, occurredOn: "2026-07-02", reportState: "transfer" }),
      ],
      "2026-09",
      "2026-09-24",
    );

    expect(pace.referenceMonths).toEqual(["2026-07", "2026-08"]);
    // A transferência não soma: julho vale zero. (0 + 4000) / 2.
    expect(pace.normalAtCutoffMinor).toBe(2000);
  });

  it("a porcentagem arredonda com sinal, como o hub", () => {
    // 1 contra 8: −87,5% arredonda para −87 (Math.round), não para 88 no módulo.
    const pace = spendingPace(
      [
        record({ id: "n", amountMinor: 1, occurredOn: "2026-09-01" }),
        record({ id: "o", amountMinor: 8, occurredOn: "2026-08-01" }),
      ],
      "2026-09",
      "2026-09-24",
    );

    expect(pace.changePercent).toBe(-87);
  });

  it("fixture grafite: 15% acima do normal de outubro no dia 19", () => {
    const pace = spendingPace(listTransactions(grafiteState()), "2026-11", GRAFITE_TODAY);

    expect(pace.referenceMonths).toEqual(["2026-10"]);
    expect(pace.spentMinor).toBe(311_341);
    expect(pace.normalAtCutoffMinor).toBe(270_500);
    expect(pace.changePercent).toBe(15);
    // Normal no fim (dia 30 de novembro) = outubro inteiro.
    expect(pace.normal[29]).toBe(366_200);
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
  const month = (m: string, incomeMinor: number, expenseMinor: number) => ({
    month: m,
    incomeMinor,
    expenseMinor,
  });

  it("é a média do que sobrou nos meses fechados com dado", () => {
    expect(
      averageSurplus(
        [month("2026-08", 1000, 400), month("2026-09", 1000, 800)],
        "2026-08",
        "2026-10",
      ),
    ).toEqual({ averageMinor: 400, months: 2 });
  });

  it("não conta mês antes do primeiro lançamento", () => {
    // Junho e julho não existiam: contá-los como zero dividiria a sobra pela metade.
    expect(
      averageSurplus(
        [
          month("2026-06", 0, 0),
          month("2026-07", 0, 0),
          month("2026-08", 1000, 400),
          month("2026-09", 1000, 800),
        ],
        "2026-08",
        "2026-10",
      ),
    ).toEqual({ averageMinor: 400, months: 2 });
  });

  it("não conta o mês corrente", () => {
    // O mês pela metade sempre parece ter sobrado muito (a receita já entrou, a despesa não).
    expect(
      averageSurplus(
        [month("2026-08", 1000, 400), month("2026-09", 1000, 800), month("2026-10", 5000, 0)],
        "2026-08",
        "2026-10",
      ),
    ).toEqual({ averageMinor: 400, months: 2 });
  });

  it("mês vazio depois do primeiro lançamento conta como zero", () => {
    expect(
      averageSurplus(
        [month("2026-07", 1000, 400), month("2026-08", 0, 0), month("2026-09", 1000, 800)],
        "2026-07",
        "2026-10",
      ),
    ).toEqual({ averageMinor: 267, months: 3 });
  });

  it("sem mês fechado não mostra média", () => {
    expect(averageSurplus([month("2026-10", 1000, 400)], "2026-10", "2026-10")).toBeNull();
    expect(averageSurplus([month("2026-09", 0, 0)], null, "2026-10")).toBeNull();
    expect(averageSurplus([], "2026-08", "2026-10")).toBeNull();
  });

  it("fixture grafite: só outubro, R$ 1.410,29", () => {
    const items = listTransactions(grafiteState());
    const bars = monthlyTotals(items, lastMonths(`2026-11-01`, 6));

    expect(averageSurplus(bars, firstMonthOf(items), "2026-11")).toEqual({
      averageMinor: 141_029,
      months: 1,
    });
  });
});
