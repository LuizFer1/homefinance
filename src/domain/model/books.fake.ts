import { card, series } from "../cards/fixtures.fake";
import { movement, reserve, tx } from "../reserves/fixtures.fake";
import type { AppState } from "./app-state";
import { EMPTY_APP_STATE } from "./app-state";
import type { BookAccount } from "./book-account";
import type { Category } from "./category";
import { ALIVE } from "./row.fake";
import type { User } from "./user";

export function category(id: string, extra: Partial<Category>): Category {
  return {
    ...ALIVE,
    id,
    name: id,
    icon: "tag",
    color: "slate",
    kind: "expense",
    mergedInto: null,
    ...extra,
  };
}

const USER: User = { ...ALIVE, id: "U1", name: "Luiz", color: "teal", avatar: null };

const BUSINESS_BOOK: BookAccount = {
  ...ALIVE,
  id: "BOOK-BIZ",
  kind: "business",
  name: "Padaria do Luiz",
  color: "amber",
  icon: "storefront",
};

/**
 * Estado com as duas contas povoadas, em agosto de 2026, para provar que cada
 * projeção só enxerga a conta que recebe. Valores em centavos.
 *
 *   pessoal:   +5000,00 salário · −300,00 alimentação (cartão P-CARD)
 *   comercial: +2000,00 venda   · −800,00 fornecedor (cartão B-CARD) · −50,00 que
 *              aponta para a categoria PESSOAL P-FOOD (referência entre contas)
 *
 * O `.fake` o mantém fora do `include` do Vitest.
 */
export function twoBooksState(): AppState {
  const rows = <T extends { id: string }>(list: T[]) =>
    Object.fromEntries(list.map((r) => [r.id, r]));
  return {
    ...EMPTY_APP_STATE,
    users: rows([USER]),
    books: rows([BUSINESS_BOOK]),
    categories: rows([
      category("P-FOOD", { name: "Alimentação" }),
      category("B-SALES", { name: "Vendas", kind: "income", book: "business" }),
      category("B-SUP", { name: "Fornecedores", book: "business" }),
    ]),
    paymentMethods: rows([card("P-CARD"), card("B-CARD", { book: "business" })]),
    transactions: rows([
      tx("p-salary", "income", 500_000, "2026-08-05"),
      tx("p-food", "expense", 30_000, "2026-08-10", "P-FOOD", {
        paymentMethodId: "P-CARD",
        cashbackMinor: 300,
      }),
      tx("p-est", "expense", 10_000, "2026-08-12", null, { estimated: true }),
      tx("b-sale", "income", 200_000, "2026-08-06", "B-SALES", { book: "business" }),
      tx("b-supply", "expense", 80_000, "2026-08-11", "B-SUP", {
        book: "business",
        paymentMethodId: "B-CARD",
        cashbackMinor: 800,
      }),
      tx("b-cross", "expense", 5_000, "2026-08-12", "P-FOOD", { book: "business" }),
      tx("b-est", "expense", 7_000, "2026-08-13", null, { book: "business", estimated: true }),
    ]),
    recurrences: rows([
      series("p-rent", null, { startOn: "2026-01-05", amountMinor: 120_000 }),
      series("b-lease", null, { startOn: "2026-01-05", amountMinor: 350_000, book: "business" }),
    ]),
    reserves: rows([reserve("P-RES"), reserve("B-RES", { book: "business" })]),
    reserveMovements: rows([
      movement("p-mov", "P-RES", 40_000, "2026-08-07"),
      movement("b-mov", "B-RES", 90_000, "2026-08-07", { book: "business" }),
    ]),
    budgets: rows([
      { ...ALIVE, id: "p-budget", categoryId: "P-FOOD", limitMinor: 50_000 },
      {
        ...ALIVE,
        id: "b-budget",
        categoryId: "B-SUP",
        limitMinor: 100_000,
        book: "business" as const,
      },
    ]),
    assets: rows([
      {
        ...ALIVE,
        id: "b-stock",
        kind: "inventory" as const,
        name: "Estoque",
        valueMinor: 1_000_000,
        acquiredOn: "2026-07-01",
        book: "business" as const,
      },
    ]),
    debts: rows([
      {
        ...ALIVE,
        id: "b-loan",
        name: "Financiamento do forno",
        principalMinor: 900_000,
        balanceMinor: 700_000,
        book: "business" as const,
      },
    ]),
  };
}
