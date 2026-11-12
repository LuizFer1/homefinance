import { describe, expect, it } from "vitest";
import {
  findCategory,
  listTransactions,
  resolveCategoryName,
  resolvePaymentMethodName,
} from "../projections/selectors";
import { uncategorized } from "../projections/uncategorized";
import type { AppState } from "./app-state";
import { EMPTY_APP_STATE } from "./app-state";
import { createBookView, stateForBook } from "./book-view";
import { twoBooksState } from "./books.fake";

const ids = (rows: Record<string, unknown>) => Object.keys(rows).sort();

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("fixture mudou");
  return value;
}
const BASE = twoBooksState();
const FOOD = must(BASE.categories["P-FOOD"]);
const SALARY = must(BASE.transactions["p-salary"]);
const SALE = must(BASE.transactions["b-sale"]);

describe("stateForBook", () => {
  const full = twoBooksState();

  it("cada conta só enxerga as linhas dela nas tabelas por conta", () => {
    const personal = stateForBook(full, "personal");
    const business = stateForBook(full, "business");

    expect(ids(personal.transactions)).toEqual(["p-est", "p-food", "p-salary"]);
    expect(ids(business.transactions)).toEqual(["b-cross", "b-est", "b-sale", "b-supply"]);
    expect(ids(personal.categories)).toEqual(["P-FOOD"]);
    expect(ids(business.categories)).toEqual(["B-SALES", "B-SUP"]);
    expect(ids(personal.paymentMethods)).toEqual(["P-CARD"]);
    expect(ids(business.paymentMethods)).toEqual(["B-CARD"]);
    expect(ids(personal.recurrences)).toEqual(["p-rent"]);
    expect(ids(business.recurrences)).toEqual(["b-lease"]);
    expect(ids(personal.reserves)).toEqual(["P-RES"]);
    expect(ids(business.reserves)).toEqual(["B-RES"]);
    expect(ids(personal.reserveMovements)).toEqual(["p-mov"]);
    expect(ids(business.reserveMovements)).toEqual(["b-mov"]);
    expect(ids(personal.budgets)).toEqual(["p-budget"]);
    expect(ids(business.budgets)).toEqual(["b-budget"]);
    expect(ids(personal.assets)).toEqual([]);
    expect(ids(business.assets)).toEqual(["b-stock"]);
    expect(ids(personal.debts)).toEqual([]);
    expect(ids(business.debts)).toEqual(["b-loan"]);
  });

  it("users e books passam inteiros nas duas contas", () => {
    for (const book of ["personal", "business"] as const) {
      const view = stateForBook(full, book);
      expect(view.users).toBe(full.users);
      expect(view.books).toBe(full.books);
    }
  });

  it("linha sem book, com null ou com valor desconhecido é da conta pessoal", () => {
    const state: AppState = {
      ...EMPTY_APP_STATE,
      categories: {
        A: { ...FOOD, id: "A" },
        B: { ...FOOD, id: "B", book: null },
        C: { ...FOOD, id: "C", book: "franchise" as never },
        D: { ...FOOD, id: "D", book: "business" },
      },
    };
    expect(ids(stateForBook(state, "personal").categories)).toEqual(["A", "B", "C"]);
    expect(ids(stateForBook(state, "business").categories)).toEqual(["D"]);
  });

  it("sem linha de outra conta, devolve a mesma tabela (identidade preservada)", () => {
    const onlyPersonal: AppState = {
      ...EMPTY_APP_STATE,
      transactions: { "p-salary": SALARY },
    };
    expect(stateForBook(onlyPersonal, "personal").transactions).toBe(onlyPersonal.transactions);
  });

  it("referência entre contas vira Sem categoria na visão, sem cascatear no disco", () => {
    const business = stateForBook(full, "business");
    const cross = business.transactions["b-cross"];
    // A categoria de destino é pessoal: a visão comercial zera a referência, e o
    // rótulo é o de "sem categoria", e não o de categoria apagada.
    expect(cross?.categoryId).toBeNull();
    expect(findCategory(business, "P-FOOD")).toBeNull();
    expect(resolveCategoryName(business, cross?.categoryId ?? null)).toBe("Sem categoria");
    expect(uncategorized(listTransactions(business), business).map((t) => t.id)).toContain(
      "b-cross",
    );
    // A pessoal segue enxergando a própria categoria, intacta; o estado completo
    // (o que vai para o disco e o hub) guarda a referência como veio.
    expect(resolveCategoryName(stateForBook(full, "personal"), "P-FOOD")).toBe("Alimentação");
    expect(full.transactions["b-cross"]?.categoryId).toBe("P-FOOD");
  });

  it("forma de pagamento de outra conta vira Sem forma de pagamento", () => {
    const state: AppState = {
      ...full,
      transactions: {
        ...full.transactions,
        "b-pay": { ...SALE, id: "b-pay", paymentMethodId: "P-CARD" },
      },
    };
    const business = stateForBook(state, "business");
    expect(business.transactions["b-pay"]?.paymentMethodId).toBeNull();
    expect(resolvePaymentMethodName(business, null)).toBe("Sem forma de pagamento");
    // A forma da própria conta fica como está.
    expect(business.transactions["b-supply"]?.paymentMethodId).toBe("B-CARD");
    expect(state.transactions["b-pay"]?.paymentMethodId).toBe("P-CARD");
  });

  it("categoria apagada na própria conta segue como Categoria removida", () => {
    const state: AppState = {
      ...full,
      categories: {
        ...full.categories,
        "B-GONE": { ...must(full.categories["B-SUP"]), id: "B-GONE", deletedAt: "x" },
      },
      transactions: {
        ...full.transactions,
        "b-gone": { ...SALE, id: "b-gone", categoryId: "B-GONE" },
        // Id que nunca existiu em nenhuma conta.
        "b-never": { ...SALE, id: "b-never", categoryId: "NUNCA-EXISTIU" },
      },
    };
    const business = stateForBook(state, "business");
    expect(business.transactions["b-gone"]?.categoryId).toBe("B-GONE");
    expect(resolveCategoryName(business, "B-GONE")).toBe("Categoria removida");
    expect(resolveCategoryName(business, "NUNCA-EXISTIU")).toBe("Categoria removida");
  });

  it("série e reserva também perdem a referência a categoria de outra conta", () => {
    const base = twoBooksState();
    const state: AppState = {
      ...base,
      recurrences: {
        ...base.recurrences,
        "b-lease": {
          ...must(base.recurrences["b-lease"]),
          categoryId: "P-FOOD",
          paymentMethodId: "P-CARD",
        },
      },
      reserves: {
        ...base.reserves,
        "B-RES": {
          ...must(base.reserves["B-RES"]),
          essentialCategoryIds: ["B-SUP", "P-FOOD"],
        },
      },
    };
    const business = stateForBook(state, "business");
    expect(business.recurrences["b-lease"]).toMatchObject({
      categoryId: null,
      paymentMethodId: null,
    });
    expect(business.reserves["B-RES"]?.essentialCategoryIds).toEqual(["B-SUP"]);
  });

  it("lançamento comercial nunca aparece na lista da conta pessoal", () => {
    const personal = listTransactions(stateForBook(full, "personal"));
    expect(personal.map((t) => t.id).sort()).toEqual(["p-est", "p-food", "p-salary"]);
  });
});

describe("createBookView", () => {
  it("reaproveita a tabela filtrada que não mudou e refiltra a que mudou", () => {
    const view = createBookView();
    const full = twoBooksState();
    const first = view(full, "business");
    const again = view({ ...full }, "business");
    expect(again.transactions).toBe(first.transactions);

    const edited: AppState = {
      ...full,
      transactions: {
        ...full.transactions,
        extra: { ...SALE, id: "extra" },
      },
    };
    const next = view(edited, "business");
    expect(next.transactions).not.toBe(first.transactions);
    expect(ids(next.transactions)).toContain("extra");
    expect(next.categories).toBe(first.categories);
  });

  it("criar categoria refaz as tabelas com referência, e só elas", () => {
    // Uma categoria nova numa conta muda quais ids são "de fora" na outra: o cache de
    // `transactions` tem que cair junto com o de `categories`.
    const view = createBookView();
    const full = twoBooksState();
    const first = view(full, "business");
    const edited: AppState = {
      ...full,
      categories: { ...full.categories, "P-NEW": must(full.categories["P-FOOD"]) },
    };
    const next = view(edited, "business");
    expect(next.transactions).not.toBe(first.transactions);
    expect(next.debts).toBe(first.debts);
    expect(next.assets).toBe(first.assets);
  });

  it("trocar de conta refiltra tudo", () => {
    const view = createBookView();
    const full = twoBooksState();
    expect(ids(view(full, "business").transactions)).toContain("b-sale");
    expect(ids(view(full, "personal").transactions)).not.toContain("b-sale");
    expect(ids(view(full, "business").transactions)).toContain("b-sale");
  });
});
