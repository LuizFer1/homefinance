import { describe, expect, it } from "vitest";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { stateOf, tx } from "../reserves/fixtures.fake";
import { filterTransactions, hasFilters, NO_FILTERS, NONE } from "./filter";
import { totals } from "./selectors";

const CAT = "cat-viva";
const DEAD = "cat-morta";

const state = {
  ...stateOf({
    transactions: [
      tx("a", "expense", 1_000, "2026-09-01", CAT, {
        description: "Padária Pão Quente",
        userId: "u1",
      }),
      tx("b", "expense", 2_000, "2026-09-02", DEAD, { description: "Mercado" }),
      tx("c", "income", 9_000, "2026-09-03", null, { description: "Salário", userId: "u2" }),
      tx("d", "expense", 500, "2026-09-04", null, {
        description: "PADARIA do Zé",
        paymentMethodId: "pm1",
        reportState: "hidden",
      }),
    ],
  }),
  categories: {
    [CAT]: {
      ...ALIVE,
      id: CAT,
      name: "Alimentação",
      icon: "utensils",
      color: "sky" as const,
      kind: "expense" as const,
    },
    [DEAD]: {
      ...ALIVE,
      id: DEAD,
      name: "Antiga",
      icon: "tag",
      color: "sky" as const,
      kind: "expense" as const,
      deletedAt: DELETED_AT,
    },
  },
};
const items = Object.values(state.transactions);
const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe("filterTransactions", () => {
  it("sem filtro devolve tudo", () => {
    expect(filterTransactions(items, NO_FILTERS, state)).toEqual(items);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it("busca sem acento nem caixa: 'padaria' acha 'Padária' e 'PADARIA'", () => {
    const found = filterTransactions(items, { ...NO_FILTERS, query: "padaria" }, state);
    expect(ids(found)).toEqual(["a", "d"]);
    expect(ids(filterTransactions(items, { ...NO_FILTERS, query: "  SALARIO " }, state))).toEqual([
      "c",
    ]);
  });

  it("busca só com pontuação ou espaços não filtra", () => {
    expect(hasFilters({ ...NO_FILTERS, query: "  " })).toBe(false);
    expect(filterTransactions(items, { ...NO_FILTERS, query: " - " }, state)).toEqual(items);
  });

  it("filtra por tipo, forma e autor", () => {
    expect(ids(filterTransactions(items, { ...NO_FILTERS, kind: "income" }, state))).toEqual(["c"]);
    expect(
      ids(filterTransactions(items, { ...NO_FILTERS, paymentMethodId: "pm1" }, state)),
    ).toEqual(["d"]);
    expect(ids(filterTransactions(items, { ...NO_FILTERS, paymentMethodId: NONE }, state))).toEqual(
      ["a", "b", "c"],
    );
    expect(ids(filterTransactions(items, { ...NO_FILTERS, userId: "u1" }, state))).toEqual(["a"]);
  });

  it("'Sem categoria' inclui a categoria apagada", () => {
    expect(ids(filterTransactions(items, { ...NO_FILTERS, categoryId: NONE }, state))).toEqual([
      "b",
      "c",
      "d",
    ]);
    expect(ids(filterTransactions(items, { ...NO_FILTERS, categoryId: CAT }, state))).toEqual([
      "a",
    ]);
  });

  it("combina em 'e'", () => {
    const found = filterTransactions(
      items,
      { ...NO_FILTERS, query: "padaria", categoryId: CAT, kind: "expense" },
      state,
    );
    expect(ids(found)).toEqual(["a"]);
  });

  it("o oculto continua listável mas não soma no recorte", () => {
    const found = filterTransactions(items, { ...NO_FILTERS, query: "padaria" }, state);
    expect(ids(found)).toContain("d");
    expect(totals(found).expenseMinor).toBe(1_000);
  });
});
