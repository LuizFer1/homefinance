import { describe, expect, it } from "vitest";
import { EMPTY_APP_STATE } from "../model/app-state";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { estimatedTotals, pendingEstimates } from "./estimates";

function tx(id: string, extra: Partial<Transaction>): Transaction {
  return {
    ...ALIVE,
    id,
    kind: "expense",
    description: id,
    amountMinor: 1_000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: "2026-10-10",
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
    ...extra,
  };
}

describe("estimatedTotals", () => {
  it("soma só as estimadas, por tipo", () => {
    const rows = [
      tx("A", { estimated: true, amountMinor: 20_000 }),
      tx("B", { estimated: true, amountMinor: 5_000, kind: "income" }),
      tx("C", { estimated: false, amountMinor: 70_000 }),
      tx("D", { amountMinor: 70_000 }),
    ];

    expect(estimatedTotals(rows)).toEqual({ incomeMinor: 5_000, expenseMinor: 20_000 });
  });
});

describe("pendingEstimates", () => {
  it("lista as estimadas vivas, da mais antiga para a mais nova", () => {
    const state = {
      ...EMPTY_APP_STATE,
      transactions: {
        OUT: tx("OUT", { estimated: true, occurredOn: "2026-10-10" }),
        AGO: tx("AGO", { estimated: true, occurredOn: "2026-08-10" }),
        APAGADA: tx("APAGADA", { estimated: true, deletedAt: DELETED_AT }),
        REAL: tx("REAL", {}),
      },
    };

    expect(pendingEstimates(state).map((row) => row.id)).toEqual(["AGO", "OUT"]);
  });
});
