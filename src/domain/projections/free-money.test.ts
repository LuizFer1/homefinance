import { describe, expect, it } from "vitest";
import { stableEntityId } from "../ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { occurrenceKey } from "../recurrence/schedule";
import { nextMonthFreeMoney } from "./free-money";

const SALARY = "01J9F3K2M7QX8YB4TVWZ0DCEH1";
const RENT = "01J9F3K2M7QX8YB4TVWZ0DCEH2";

function series(overrides: Partial<Recurrence>): Recurrence {
  return {
    id: RENT,
    ...ALIVE,
    kind: "expense",
    description: "Aluguel",
    amountMinor: 23_000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    frequency: "monthly",
    scheduleType: "dayOfMonth",
    scheduleN: 10,
    startOn: "2026-06-10",
    endOn: null,
    active: true,
    ...overrides,
  };
}

function occurrence(recurrence: Recurrence, period: string, overrides: Partial<Transaction> = {}) {
  const key = occurrenceKey(recurrence.id, period);
  const row: Transaction = {
    id: stableEntityId(key),
    ...ALIVE,
    kind: recurrence.kind,
    description: recurrence.description,
    amountMinor: recurrence.amountMinor,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: `${period}-${String(recurrence.scheduleN).padStart(2, "0")}`,
    userId: null,
    recurrenceId: recurrence.id,
    occurrenceKey: key,
    ...overrides,
  };
  return row;
}

function stateWith(recurrences: Recurrence[], transactions: Transaction[] = []): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: Object.fromEntries(recurrences.map((row) => [row.id, row])),
    transactions: Object.fromEntries(transactions.map((row) => [row.id, row])),
  };
}

const salary = series({
  id: SALARY,
  kind: "income",
  description: "Salário",
  amountMinor: 100_000,
  scheduleN: 5,
});

describe("nextMonthFreeMoney", () => {
  it("entradas recorrentes menos saídas recorrentes do mês seguinte", () => {
    const result = nextMonthFreeMoney(stateWith([salary, series({})]), "2026-11-09");

    expect(result).toEqual({
      month: "2026-12",
      incomeMinor: 100_000,
      expenseMinor: 23_000,
      freeMinor: 77_000,
      estimated: false,
    });
  });

  it("vira o ano em dezembro", () => {
    expect(nextMonthFreeMoney(stateWith([salary]), "2026-12-20").month).toBe("2027-01");
  });

  it("série semanal conta cada ocorrência do mês", () => {
    const weekly = series({ frequency: "weekly", startOn: "2026-11-02", amountMinor: 5_000 });

    // Segundas de dezembro de 2026: 7, 14, 21 e 28.
    expect(nextMonthFreeMoney(stateWith([weekly]), "2026-11-09").expenseMinor).toBe(20_000);
  });

  it("ignora série pausada, apagada ou encerrada antes do mês", () => {
    const state = stateWith([
      series({ id: "01J9F3K2M7QX8YB4TVWZ0DCEH3", active: false }),
      series({ id: "01J9F3K2M7QX8YB4TVWZ0DCEH4", deletedAt: DELETED_AT }),
      series({ id: "01J9F3K2M7QX8YB4TVWZ0DCEH5", endOn: "2026-11-30" }),
    ]);

    expect(nextMonthFreeMoney(state, "2026-11-09").expenseMinor).toBe(0);
  });

  it("conta uma vez a ocorrência que já foi gravada, com o valor gravado", () => {
    const rent = series({});
    const state = stateWith([rent], [occurrence(rent, "2026-12", { amountMinor: 25_000 })]);

    expect(nextMonthFreeMoney(state, "2026-11-09").expenseMinor).toBe(25_000);
  });

  it("ocorrência apagada pelo usuário não compromete o mês", () => {
    const rent = series({});
    const state = stateWith([rent], [occurrence(rent, "2026-12", { deletedAt: DELETED_AT })]);

    expect(nextMonthFreeMoney(state, "2026-11-09").expenseMinor).toBe(0);
  });

  it("ocorrência gravada fora dos totais não conta", () => {
    const rent = series({});
    const state = stateWith([rent], [occurrence(rent, "2026-12", { reportState: "transfer" })]);

    expect(nextMonthFreeMoney(state, "2026-11-09").expenseMinor).toBe(0);
  });

  it("série variável marca o número como estimado", () => {
    const power = series({ variable: true, amountMinor: 18_000 });

    const result = nextMonthFreeMoney(stateWith([power]), "2026-11-09");

    expect(result).toMatchObject({ expenseMinor: 18_000, estimated: true });
  });

  it("fica negativo quando as saídas passam das entradas", () => {
    const result = nextMonthFreeMoney(stateWith([series({})]), "2026-11-09");

    expect(result.freeMinor).toBe(-23_000);
  });
});
