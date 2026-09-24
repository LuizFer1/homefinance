import { describe, expect, it } from "vitest";
import { stableEntityId } from "../ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import type { Transaction } from "../model/transaction";
import { planOccurrences } from "./plan";
import { occurrenceKey } from "./schedule";

const BASE = {
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "1754697600000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ",
  deletedAt: null,
  dirty: 1,
} as const;

const SALARIO: Recurrence = {
  ...BASE,
  id: "SERIE-1",
  kind: "income",
  description: "Salário",
  amountMinor: 500_000,
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

/** Só para `nthBusinessDay` — casos portados de `materialize.test.ts` (M1). */
const SALARIO_DIA_UTIL: Recurrence = {
  ...SALARIO,
  id: "SERIE-2",
  scheduleType: "nthBusinessDay",
  startOn: "2026-06-01",
};

function stateWith(series: Recurrence, transactions: Transaction[] = []): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: { [series.id]: series },
    transactions: Object.fromEntries(transactions.map((t) => [t.id, t])),
  };
}

/** Ocorrência já materializada para `series`, na competência `period`. */
function occurrenceOf(series: Recurrence, period: string, occurredOn: string): Transaction {
  const key = occurrenceKey(series.id, period);
  return {
    ...BASE,
    id: stableEntityId(key),
    kind: series.kind,
    description: series.description,
    amountMinor: series.amountMinor,
    currency: series.currency,
    categoryId: series.categoryId,
    paymentMethodId: series.paymentMethodId,
    cashbackMinor: series.cashbackMinor,
    occurredOn,
    userId: null,
    recurrenceId: series.id,
    occurrenceKey: key,
  };
}

describe("planOccurrences", () => {
  it("planeja uma ocorrência por competência vencida", () => {
    const plans = planOccurrences(stateWith(SALARIO), "2026-08-10");
    expect(plans.map((p) => p.draft.occurredOn)).toEqual([
      "2026-06-05",
      "2026-07-05",
      "2026-08-05",
    ]);
    expect(plans[0]?.draft).toMatchObject({ recurrenceId: "SERIE-1", amountMinor: 500_000 });
  });

  it("não planeja competência cuja linha já existe, mesmo apagada", () => {
    const period = "2026-06";
    const key = occurrenceKey("SERIE-1", period);
    const apagada: Transaction = {
      ...BASE,
      id: stableEntityId(key),
      deletedAt: BASE.updatedAt,
      kind: "income",
      description: "Salário",
      amountMinor: 500_000,
      currency: "BRL",
      categoryId: null,
      paymentMethodId: null,
      cashbackMinor: null,
      occurredOn: "2026-06-05",
      userId: null,
      recurrenceId: "SERIE-1",
      occurrenceKey: key,
    };
    const plans = planOccurrences(stateWith(SALARIO, [apagada]), "2026-07-10");
    expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-07-05"]);
  });

  it("ignora série inativa, apagada ou que ainda não começou", () => {
    expect(planOccurrences(stateWith({ ...SALARIO, active: false }), "2026-08-10")).toEqual([]);
    expect(
      planOccurrences(stateWith({ ...SALARIO, deletedAt: BASE.updatedAt }), "2026-08-10"),
    ).toEqual([]);
    expect(planOccurrences(stateWith(SALARIO), "2026-06-01")).toEqual([]);
  });

  it("respeita endOn", () => {
    const plans = planOccurrences(stateWith({ ...SALARIO, endOn: "2026-07-01" }), "2026-09-10");
    expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-06-05"]);
  });

  it("não planeja competência já materializada e viva", () => {
    const junho = occurrenceOf(SALARIO, "2026-06", "2026-06-05");
    const plans = planOccurrences(stateWith(SALARIO, [junho]), "2026-07-10");
    expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-07-05"]);
  });

  it("não gera a competência do mês corrente que ainda não chegou", () => {
    // Dia 5, hoje é dia 3: agosto ainda não venceu.
    const plans = planOccurrences(stateWith(SALARIO), "2026-08-03");
    expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-06-05", "2026-07-05"]);
  });

  it("estado vazio não planeja nada", () => {
    expect(planOccurrences(EMPTY_APP_STATE, "2026-08-11")).toEqual([]);
  });

  describe("nthBusinessDay (portado de materialize.test.ts)", () => {
    it("gera competências vencidas até hoje no 5º dia útil", () => {
      // 2026-08-11: 5º útil de ago = 07, de jul = 07, de jun = 05 — todos <= 11.
      const plans = planOccurrences(stateWith(SALARIO_DIA_UTIL), "2026-08-11");
      expect(plans.map((p) => p.draft.occurredOn)).toEqual([
        "2026-06-05",
        "2026-07-07",
        "2026-08-07",
      ]);
      expect(plans[0]?.entityId).toBe(stableEntityId(occurrenceKey("SERIE-2", "2026-06")));
      expect(plans[0]?.draft.recurrenceId).toBe("SERIE-2");
    });

    it("não gera competência futura nem série pausada", () => {
      // 2026-08-04: 5º útil de ago é 07, ainda não chegou.
      const plans = planOccurrences(stateWith(SALARIO_DIA_UTIL), "2026-08-04");
      expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-06-05", "2026-07-07"]);

      expect(
        planOccurrences(stateWith({ ...SALARIO_DIA_UTIL, active: false }), "2026-08-11"),
      ).toEqual([]);
    });

    it("pula o que já está materializado", () => {
      const junho = occurrenceOf(SALARIO_DIA_UTIL, "2026-06", "2026-06-05");
      const plans = planOccurrences(stateWith(SALARIO_DIA_UTIL, [junho]), "2026-08-11");
      expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-07-07", "2026-08-07"]);
    });
  });
});
