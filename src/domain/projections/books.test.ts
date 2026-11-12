import { describe, expect, it } from "vitest";
import { listBudgets } from "../budgets/list";
import type { AppState } from "../model/app-state";
import { stateForBook } from "../model/book-view";
import { twoBooksState } from "../model/books.fake";
import { availableBalance, listReserves, monthBalance, reserveBalance } from "../reserves/balances";
import { filterByMonth, monthlyTotals } from "./breakdown";
import { cardSpend } from "./card-bar";
import { dailyExpenses } from "./daily-expenses";
import { estimatedTotals, pendingEstimates } from "./estimates";
import { filterTransactions, NO_FILTERS, NONE } from "./filter";
import { nextMonthFreeMoney, recurringMonth } from "./free-money";
import { cashbackSummary, categoryBreakdown, categoryUsage, monthComparison } from "./insights";
import {
  findCategory,
  groupByDay,
  listCategories,
  listPaymentMethods,
  listTransactions,
  totals,
} from "./selectors";
import { uncategorized } from "./uncategorized";

/**
 * Cada projeção recebe a visão de uma conta (`stateForBook`) e só pode enxergar
 * ela. Estado com as duas contas povoadas: o comercial (B) tem números
 * diferentes do pessoal (P) em toda projeção, então um vazamento mudaria o
 * resultado.
 */
const FULL = twoBooksState();
const P: AppState = stateForBook(FULL, "personal");
const B: AppState = stateForBook(FULL, "business");
const MONTH = "2026-08";

const idsOf = (items: { id: string }[]) => items.map((i) => i.id);

describe("projeções com as duas contas povoadas", () => {
  it("listTransactions e totals", () => {
    expect(idsOf(listTransactions(P))).toEqual(["p-est", "p-food", "p-salary"]);
    expect(idsOf(listTransactions(B))).toEqual(["b-est", "b-cross", "b-supply", "b-sale"]);
    expect(totals(listTransactions(P))).toEqual({
      incomeMinor: 500_000,
      expenseMinor: 40_000,
      balanceMinor: 460_000,
    });
    expect(totals(listTransactions(B))).toEqual({
      incomeMinor: 200_000,
      expenseMinor: 92_000,
      balanceMinor: 108_000,
    });
  });

  it("groupByDay soma só os dias da conta", () => {
    const days = (s: AppState) => groupByDay(listTransactions(s)).map((g) => g.date);
    expect(days(P)).toEqual(["2026-08-12", "2026-08-10", "2026-08-05"]);
    expect(days(B)).toEqual(["2026-08-13", "2026-08-12", "2026-08-11", "2026-08-06"]);
  });

  it("monthlyTotals, filterByMonth e monthComparison", () => {
    expect(monthlyTotals(listTransactions(P), [MONTH])).toEqual([
      { month: MONTH, incomeMinor: 500_000, expenseMinor: 40_000 },
    ]);
    expect(monthlyTotals(listTransactions(B), [MONTH])).toEqual([
      { month: MONTH, incomeMinor: 200_000, expenseMinor: 92_000 },
    ]);
    expect(filterByMonth(listTransactions(B), MONTH)).toHaveLength(4);
    expect(monthComparison(listTransactions(P), MONTH).current.incomeMinor).toBe(500_000);
    expect(monthComparison(listTransactions(B), MONTH).current.incomeMinor).toBe(200_000);
  });

  it("dailyExpenses", () => {
    const p = dailyExpenses(listTransactions(P), MONTH);
    const b = dailyExpenses(listTransactions(B), MONTH);
    expect(p.byDay[9]).toBe(30_000);
    expect(p.byDay[10]).toBe(0);
    expect(p.maxMinor).toBe(30_000);
    expect(b.byDay[9]).toBe(0);
    expect(b.byDay[10]).toBe(80_000);
    expect(b.maxMinor).toBe(80_000);
  });

  it("cardSpend usa só os cartões da conta", () => {
    const p = cardSpend(filterByMonth(listTransactions(P), MONTH), P);
    const b = cardSpend(filterByMonth(listTransactions(B), MONTH), B);
    expect(p.cardMinor).toBe(30_000);
    expect(p.segments.map((s) => s.minor)).toEqual([30_000]);
    expect(b.cardMinor).toBe(80_000);
    expect(b.segments.map((s) => s.minor)).toEqual([80_000]);
  });

  it("categoryBreakdown, categoryUsage e cashbackSummary", () => {
    const p = categoryBreakdown(listTransactions(P), P);
    expect(p.map((c) => [c.name, c.amountMinor])).toEqual([
      ["Alimentação", 30_000],
      ["Sem categoria", 10_000],
    ]);
    // `b-cross` aponta para a categoria pessoal: na visão comercial é "Sem categoria".
    const b = categoryBreakdown(listTransactions(B), B);
    expect(b.map((c) => [c.name, c.amountMinor])).toEqual([
      ["Fornecedores", 80_000],
      ["Sem categoria", 12_000],
    ]);
    expect(categoryUsage(listTransactions(P), MONTH, "paymentMethodId")).toEqual({ "P-CARD": 1 });
    expect(categoryUsage(listTransactions(B), MONTH, "paymentMethodId")).toEqual({ "B-CARD": 1 });
    expect(cashbackSummary(listTransactions(P), P).totalMinor).toBe(300);
    expect(cashbackSummary(listTransactions(B), B).totalMinor).toBe(800);
  });

  it("estimativas", () => {
    expect(estimatedTotals(listTransactions(P))).toEqual({ incomeMinor: 0, expenseMinor: 10_000 });
    expect(estimatedTotals(listTransactions(B))).toEqual({ incomeMinor: 0, expenseMinor: 7_000 });
    expect(idsOf(pendingEstimates(P))).toEqual(["p-est"]);
    expect(idsOf(pendingEstimates(B))).toEqual(["b-est"]);
  });

  it("filterTransactions e uncategorized: a referência entre contas é Sem categoria", () => {
    const none = { ...NO_FILTERS, categoryId: NONE };
    expect(idsOf(filterTransactions(listTransactions(P), none, P))).toEqual(["p-est", "p-salary"]);
    expect(idsOf(filterTransactions(listTransactions(B), none, B))).toEqual(["b-est", "b-cross"]);
    expect(idsOf(uncategorized(listTransactions(P), P))).toEqual(["p-est", "p-salary"]);
    expect(idsOf(uncategorized(listTransactions(B), B))).toEqual(["b-est", "b-cross"]);
    expect(findCategory(B, "P-FOOD")).toBeNull();
  });

  it("cadastros: categorias e formas de pagamento", () => {
    expect(listCategories(P).map((c) => c.name)).toEqual(["Alimentação"]);
    expect(listCategories(B).map((c) => c.name)).toEqual(["Fornecedores", "Vendas"]);
    expect(idsOf(listPaymentMethods(P))).toEqual(["P-CARD"]);
    expect(idsOf(listPaymentMethods(B))).toEqual(["B-CARD"]);
  });

  it("recorrência: dinheiro livre e mês projetado", () => {
    expect(recurringMonth(P, MONTH)).toMatchObject({ incomeMinor: 0, expenseMinor: 120_000 });
    expect(recurringMonth(B, MONTH)).toMatchObject({ incomeMinor: 0, expenseMinor: 350_000 });
    expect(nextMonthFreeMoney(P, "2026-08-15").freeMinor).toBe(-120_000);
    expect(nextMonthFreeMoney(B, "2026-08-15").freeMinor).toBe(-350_000);
  });

  it("reservas: saldo do mês, disponível e movimentos nunca cruzam", () => {
    expect(idsOf(listReserves(P))).toEqual(["P-RES"]);
    expect(idsOf(listReserves(B))).toEqual(["B-RES"]);
    expect(reserveBalance(P, "P-RES")).toBe(40_000);
    expect(reserveBalance(P, "B-RES")).toBe(0);
    expect(reserveBalance(B, "B-RES")).toBe(90_000);
    expect(monthBalance(P, MONTH)).toBe(420_000);
    expect(monthBalance(B, MONTH)).toBe(18_000);
    expect(availableBalance(P)).toBe(420_000);
    expect(availableBalance(B)).toBe(18_000);
  });

  it("metas por categoria", () => {
    expect(idsOf(listBudgets(P))).toEqual(["p-budget"]);
    expect(idsOf(listBudgets(B))).toEqual(["b-budget"]);
  });

  it("bens e dívidas nunca entram em receita nem despesa", () => {
    // Existem no estado comercial e a conta pessoal não os vê; os totais do
    // comercial são os mesmos de antes de eles existirem.
    expect(Object.keys(B.assets)).toEqual(["b-stock"]);
    expect(Object.keys(B.debts)).toEqual(["b-loan"]);
    expect(Object.keys(P.assets)).toEqual([]);
    expect(Object.keys(P.debts)).toEqual([]);
    expect(totals(listTransactions(B)).balanceMinor).toBe(108_000);
  });
});
