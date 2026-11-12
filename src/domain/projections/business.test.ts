import { describe, expect, it } from "vitest";
import type { AppState } from "../model/app-state";
import type { Asset } from "../model/asset";
import { stateForBook } from "../model/book-view";
import { twoBooksState } from "../model/books.fake";
import type { Debt } from "../model/debt";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { capitalByKind, debtTotal, listAssets, listDebts } from "./business";
import { monthComparison } from "./insights";
import { listTransactions, totals } from "./selectors";

function asset(id: string, kind: string, valueMinor: number, extra: Partial<Asset> = {}): Asset {
  return {
    ...ALIVE,
    id,
    kind: kind as Asset["kind"],
    name: id,
    valueMinor,
    acquiredOn: "2026-08-01",
    book: "business",
    ...extra,
  };
}

function debt(id: string, balanceMinor: number, extra: Partial<Debt> = {}): Debt {
  return {
    ...ALIVE,
    id,
    name: id,
    principalMinor: 9_999_999,
    balanceMinor,
    book: "business",
    ...extra,
  };
}

describe("capitalByKind", () => {
  it("soma por tipo e o total é investimento + estoque + equipamento", () => {
    const capital = capitalByKind([
      asset("a1", "investment", 100_000),
      asset("a2", "investment", 50_000),
      asset("a3", "inventory", 300_000),
      asset("a4", "equipment", 70_000),
    ]);
    expect(capital).toEqual({
      investmentMinor: 150_000,
      inventoryMinor: 300_000,
      equipmentMinor: 70_000,
      totalMinor: 520_000,
    });
  });

  it("sem bens, tudo zero", () => {
    expect(capitalByKind([])).toEqual({
      investmentMinor: 0,
      inventoryMinor: 0,
      equipmentMinor: 0,
      totalMinor: 0,
    });
  });

  it("ignora bens apagados", () => {
    const capital = capitalByKind([
      asset("a1", "inventory", 100_000),
      asset("a2", "inventory", 900_000, { deletedAt: DELETED_AT }),
    ]);
    expect(capital.inventoryMinor).toBe(100_000);
    expect(capital.totalMinor).toBe(100_000);
  });

  it("tipo desconhecido de uma versão futura fica fora do total, como no hub", () => {
    const capital = capitalByKind([
      asset("a1", "equipment", 10_000),
      asset("a2", "vehicle", 500_000),
    ]);
    expect(capital.totalMinor).toBe(10_000);
  });

  it("bem de outra conta nunca vira capital", () => {
    const capital = capitalByKind([
      asset("a1", "equipment", 10_000),
      asset("a2", "equipment", 77_000, { book: "personal" }),
      asset("a3", "equipment", 66_000, { book: null }),
    ]);
    expect(capital.equipmentMinor).toBe(10_000);
  });
});

describe("debtTotal", () => {
  it("soma o saldo devedor, não o valor original", () => {
    expect(debtTotal([debt("d1", 700_000), debt("d2", 25_000)])).toBe(725_000);
  });

  it("ignora dívidas apagadas e de outra conta", () => {
    expect(
      debtTotal([
        debt("d1", 100),
        debt("d2", 900, { deletedAt: DELETED_AT }),
        debt("d3", 500, { book: "personal" }),
      ]),
    ).toBe(100);
  });

  it("sem dívidas, zero; dívida quitada (saldo 0) não soma", () => {
    expect(debtTotal([])).toBe(0);
    expect(debtTotal([debt("d1", 0)])).toBe(0);
  });
});

describe("listAssets e listDebts", () => {
  it("bens: vivos, mais recentes primeiro", () => {
    const state = {
      ...twoBooksState(),
      assets: Object.fromEntries(
        [
          asset("a1", "equipment", 1, { acquiredOn: "2026-06-01" }),
          asset("a2", "equipment", 1, { acquiredOn: "2026-08-01" }),
          asset("a3", "equipment", 1, { deletedAt: DELETED_AT }),
        ].map((a) => [a.id, a]),
      ),
    };
    expect(listAssets(state).map((a) => a.id)).toEqual(["a2", "a1"]);
  });

  it("dívidas: vence primeiro na frente, sem vencimento no fim", () => {
    const state: AppState = {
      ...twoBooksState(),
      debts: Object.fromEntries(
        [
          debt("d1", 1, { name: "Zeta" }),
          debt("d2", 1, { name: "Beta", dueOn: "2026-12-01" }),
          debt("d3", 1, { name: "Alfa", dueOn: "2026-10-01" }),
          debt("d4", 1, { name: "Alfa2" }),
          debt("d5", 1, { deletedAt: DELETED_AT }),
        ].map((d) => [d.id, d]),
      ),
    };
    expect(listDebts(state).map((d) => d.id)).toEqual(["d3", "d2", "d4", "d1"]);
  });
});

describe("as duas contas", () => {
  const FULL = twoBooksState();
  const P = stateForBook(FULL, "personal");
  const B = stateForBook(FULL, "business");

  it("a conta pessoal não vê bens nem dívidas", () => {
    expect(listAssets(P)).toEqual([]);
    expect(listDebts(P)).toEqual([]);
    expect(capitalByKind(Object.values(P.assets)).totalMinor).toBe(0);
    expect(debtTotal(Object.values(P.debts))).toBe(0);
  });

  it("a comercial vê os dela", () => {
    expect(capitalByKind(Object.values(B.assets))).toEqual({
      investmentMinor: 0,
      inventoryMinor: 1_000_000,
      equipmentMinor: 0,
      totalMinor: 1_000_000,
    });
    expect(debtTotal(Object.values(B.debts))).toBe(700_000);
  });

  it("bens e dívidas não mudam receita, despesa nem resultado", () => {
    const semPatrimonio: AppState = { ...FULL, assets: {}, debts: {} };
    const comPatrimonio: AppState = {
      ...FULL,
      assets: {
        ...FULL.assets,
        x: asset("x", "investment", 5_000_000),
      },
      debts: { ...FULL.debts, y: debt("y", 3_000_000) },
    };
    for (const book of ["personal", "business"] as const) {
      const before = stateForBook(semPatrimonio, book);
      const after = stateForBook(comPatrimonio, book);
      expect(totals(listTransactions(after))).toEqual(totals(listTransactions(before)));
      expect(monthComparison(listTransactions(after), "2026-08")).toEqual(
        monthComparison(listTransactions(before), "2026-08"),
      );
    }
  });
});
