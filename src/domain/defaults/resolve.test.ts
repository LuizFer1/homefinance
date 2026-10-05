import { describe, expect, it } from "vitest";
import { EMPTY_APP_STATE } from "../model/app-state";
import type { Category } from "../model/category";
import type { PaymentMethod } from "../model/payment-method";
import type { Recurrence } from "../model/recurrence";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { reserve, tx } from "../reserves/fixtures.fake";
import { resolveMerged } from "./resolve";

function category(id: string, extra: Partial<Category> = {}): Category {
  return { ...ALIVE, id, name: id, icon: "utensils", color: "orange", kind: "expense", ...extra };
}

function method(id: string, extra: Partial<PaymentMethod> = {}): PaymentMethod {
  return { ...ALIVE, id, name: id, icon: "zap", color: "teal", kind: "pix", ...extra };
}

const recurrence = (id: string, extra: Partial<Recurrence>): Recurrence => ({
  ...ALIVE,
  id,
  kind: "expense",
  description: id,
  amountMinor: 100,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  frequency: "monthly",
  scheduleType: "dayOfMonth",
  scheduleN: 5,
  startOn: "2026-01-01",
  endOn: null,
  active: true,
  ...extra,
});

const byId = <T extends { id: string }>(rows: T[]) =>
  Object.fromEntries(rows.map((row) => [row.id, row]));

describe("resolveMerged", () => {
  it("sem lápide com redirecionamento devolve o mesmo estado", () => {
    const state = {
      ...EMPTY_APP_STATE,
      categories: byId([category("velha", { deletedAt: DELETED_AT })]),
      transactions: byId([tx("t1", "expense", 100, "2026-10-01", "velha")]),
    };
    expect(resolveMerged(state)).toBe(state);
  });

  it("segue o redirecionamento em lançamentos, séries e reservas", () => {
    const state = {
      ...EMPTY_APP_STATE,
      categories: byId([
        category("nova"),
        category("velha", { deletedAt: DELETED_AT, mergedInto: "nova" }),
      ]),
      paymentMethods: byId([
        method("pix"),
        method("pix-velho", { deletedAt: DELETED_AT, mergedInto: "pix" }),
      ]),
      transactions: byId([
        tx("t1", "expense", 100, "2026-10-01", "velha", { paymentMethodId: "pix-velho" }),
        tx("t2", "expense", 100, "2026-10-01", "nova"),
      ]),
      recurrences: byId([recurrence("r1", { categoryId: "velha", paymentMethodId: "pix-velho" })]),
      reserves: byId([reserve("res", { essentialCategoryIds: ["velha", "outra"] })]),
    };

    const next = resolveMerged(state);

    expect(next.transactions.t1?.categoryId).toBe("nova");
    expect(next.transactions.t1?.paymentMethodId).toBe("pix");
    expect(next.transactions.t2).toBe(state.transactions.t2);
    expect(next.recurrences.r1?.categoryId).toBe("nova");
    expect(next.recurrences.r1?.paymentMethodId).toBe("pix");
    expect(next.reserves.res?.essentialCategoryIds).toEqual(["nova", "outra"]);
  });

  it("não duplica a categoria essencial quando a cópia e a estável estão na lista", () => {
    const state = {
      ...EMPTY_APP_STATE,
      categories: byId([
        category("nova"),
        category("velha", { deletedAt: DELETED_AT, mergedInto: "nova" }),
      ]),
      reserves: byId([reserve("res", { essentialCategoryIds: ["velha", "nova"] })]),
    };
    expect(resolveMerged(state).reserves.res?.essentialCategoryIds).toEqual(["nova"]);
  });

  it("segue a cadeia e não trava num ciclo", () => {
    const state = {
      ...EMPTY_APP_STATE,
      categories: byId([
        category("a", { deletedAt: DELETED_AT, mergedInto: "b" }),
        category("b", { deletedAt: DELETED_AT, mergedInto: "c" }),
        category("c"),
        category("x", { deletedAt: DELETED_AT, mergedInto: "y" }),
        category("y", { deletedAt: DELETED_AT, mergedInto: "x" }),
      ]),
      transactions: byId([
        tx("t1", "expense", 100, "2026-10-01", "a"),
        tx("t2", "expense", 100, "2026-10-01", "x"),
      ]),
    };
    const next = resolveMerged(state);
    expect(next.transactions.t1?.categoryId).toBe("c");
    expect(["x", "y"]).toContain(next.transactions.t2?.categoryId);
  });

  it("ignora mergedInto numa linha viva", () => {
    const state = {
      ...EMPTY_APP_STATE,
      categories: byId([category("nova"), category("viva", { mergedInto: "nova" })]),
      transactions: byId([tx("t1", "expense", 100, "2026-10-01", "viva")]),
    };
    expect(resolveMerged(state)).toBe(state);
  });
});
