import { describe, expect, it } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { earliestOccurrenceAuthors, planAuthorRepair, seriesAuthor } from "./author";

const SERIE: Recurrence = {
  ...ALIVE,
  id: "SERIE-1",
  kind: "expense",
  description: "Internet",
  amountMinor: 10_000,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  frequency: "monthly",
  scheduleType: "dayOfMonth",
  scheduleN: 5,
  startOn: "2026-06-05",
  endOn: null,
  active: true,
};

function mes(month: string, userId: string | null, over: Partial<Transaction> = {}): Transaction {
  return {
    ...ALIVE,
    id: `OC-${month}`,
    kind: "expense",
    description: "Internet",
    amountMinor: 10_000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: `${month}-05`,
    userId,
    recurrenceId: "SERIE-1",
    occurrenceKey: `SERIE-1:${month}`,
    ...over,
  };
}

function stateWith(series: Recurrence[], transactions: Transaction[]): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: Object.fromEntries(series.map((s) => [s.id, s])),
    transactions: Object.fromEntries(transactions.map((t) => [t.id, t])),
  };
}

describe("earliestOccurrenceAuthors / seriesAuthor", () => {
  it("a ocorrência mais antiga decide, inclusive apagada", () => {
    const authors = earliestOccurrenceAuthors([
      mes("2026-07", "BIA"),
      mes("2026-06", "ANA", { deletedAt: DELETED_AT }),
    ]);
    expect(authors.get("SERIE-1")).toBe("ANA");
  });

  it("ocorrência sem autor não é pista", () => {
    const authors = earliestOccurrenceAuthors([mes("2026-06", null), mes("2026-07", "BIA")]);
    expect(authors.get("SERIE-1")).toBe("BIA");
  });

  it("o autor gravado na série vence a dedução", () => {
    const earliest = new Map([["SERIE-1", "BIA"]]);
    expect(seriesAuthor({ id: "SERIE-1", userId: "ANA" }, earliest)).toBe("ANA");
    expect(seriesAuthor({ id: "SERIE-1" }, earliest)).toBe("BIA");
    expect(seriesAuthor({ id: "SERIE-1" }, new Map())).toBeNull();
  });
});

describe("planAuthorRepair", () => {
  it("série antiga: grava o autor deduzido e corrige os meses do outro aparelho", () => {
    const junho = mes("2026-06", "ANA");
    const julho = mes("2026-07", "BIA");
    const agosto = mes("2026-08", "BIA", { deletedAt: DELETED_AT });
    const plan = planAuthorRepair(stateWith([SERIE], [junho, julho, agosto]));

    expect(plan.recurrences).toEqual([{ row: SERIE, userId: "ANA" }]);
    expect(plan.transactions.map((t) => [t.row.id, t.userId])).toEqual([
      ["OC-2026-07", "ANA"],
      ["OC-2026-08", "ANA"],
    ]);
  });

  it("série com autor: só as ocorrências divergentes", () => {
    const serie = { ...SERIE, userId: "ANA" };
    const plan = planAuthorRepair(
      stateWith([serie], [mes("2026-06", "BIA"), mes("2026-07", "ANA")]),
    );
    expect(plan.recurrences).toEqual([]);
    expect(plan.transactions.map((t) => t.row.id)).toEqual(["OC-2026-06"]);
  });

  it("tudo certo: plano vazio", () => {
    const serie = { ...SERIE, userId: "ANA" };
    expect(planAuthorRepair(stateWith([serie], [mes("2026-06", "ANA")]))).toEqual({
      recurrences: [],
      transactions: [],
    });
  });

  it("série sem ocorrências nem autor fica intacta; série apagada não ganha autor", () => {
    expect(planAuthorRepair(stateWith([SERIE], []))).toEqual({ recurrences: [], transactions: [] });

    const apagada = { ...SERIE, deletedAt: DELETED_AT };
    const plan = planAuthorRepair(
      stateWith([apagada], [mes("2026-06", "ANA"), mes("2026-07", "BIA")]),
    );
    expect(plan.recurrences).toEqual([]);
    expect(plan.transactions.map((t) => t.row.id)).toEqual(["OC-2026-07"]);
  });

  it("lançamento avulso não entra", () => {
    const avulso = mes("2026-06", "BIA", { id: "AV", recurrenceId: null, occurrenceKey: null });
    expect(
      planAuthorRepair(stateWith([{ ...SERIE, userId: "ANA" }], [avulso])).transactions,
    ).toEqual([]);
  });
});
