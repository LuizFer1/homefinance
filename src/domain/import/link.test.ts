import { describe, expect, it } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { confirmedImportKeys, type LinkCandidate, suggestLinks } from "./link";

function estimate(id: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    ...ALIVE,
    id,
    kind: "expense",
    description: id,
    amountMinor: 20_000,
    currency: "BRL",
    categoryId: "CASA",
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: "2026-10-10",
    userId: null,
    recurrenceId: "SERIE",
    occurrenceKey: `SERIE:2026-10`,
    estimated: true,
    ...extra,
  };
}

function stateWith(...rows: Transaction[]): AppState {
  return { ...EMPTY_APP_STATE, transactions: Object.fromEntries(rows.map((r) => [r.id, r])) };
}

const LINHA: LinkCandidate = {
  date: "2026-10-12",
  kind: "expense",
  categoryId: "CASA",
  eligible: true,
};

describe("suggestLinks", () => {
  it("vincula quando há exatamente uma estimativa do mesmo tipo, categoria e mês", () => {
    expect(suggestLinks(stateWith(estimate("LUZ")), [LINHA])).toEqual(["LUZ"]);
  });

  it("duas candidatas: não chuta", () => {
    expect(suggestLinks(stateWith(estimate("LUZ"), estimate("AGUA")), [LINHA])).toEqual([null]);
  });

  it("ignora outro mês, outra categoria, outro tipo, confirmada e apagada", () => {
    const state = stateWith(
      estimate("SET", { occurredOn: "2026-09-10" }),
      estimate("LAZER", { categoryId: "LAZER" }),
      estimate("RECEITA", { kind: "income" }),
      estimate("REAL", { estimated: false }),
      estimate("APAGADA", { deletedAt: DELETED_AT }),
    );

    expect(suggestLinks(state, [LINHA])).toEqual([null]);
  });

  it("linha inelegível ou sem categoria não recebe sugestão", () => {
    const state = stateWith(estimate("LUZ"));

    expect(
      suggestLinks(state, [
        { ...LINHA, eligible: false },
        { ...LINHA, categoryId: null },
      ]),
    ).toEqual([null, null]);
  });

  it("a mesma estimativa não vai para duas linhas", () => {
    expect(suggestLinks(stateWith(estimate("LUZ")), [LINHA, LINHA])).toEqual(["LUZ", null]);
  });
});

describe("confirmedImportKeys", () => {
  it("junta os importKey gravados, inclusive de linha apagada", () => {
    const state = stateWith(
      estimate("A", { importKey: "K1" }),
      estimate("B", { importKey: "K2", deletedAt: DELETED_AT }),
      estimate("C"),
    );

    expect([...confirmedImportKeys(state)].sort()).toEqual(["K1", "K2"]);
  });
});
