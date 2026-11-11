import { describe, expect, it } from "vitest";
import { stableEntityId } from "../ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { occurrenceKey } from "../recurrence/schedule";
import { nextMonthFreeMoney, recurringMonth } from "./free-money";

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

describe("recurringMonth", () => {
  it("no mês corrente soma a ocorrência já gravada com a que ainda vai nascer, uma vez cada", () => {
    // Dia 9 de novembro: o salário do dia 5 já foi materializado (com o valor
    // que o usuário corrigiu); o aluguel do dia 10 ainda é só regra.
    const state = stateWith(
      [salary, series({})],
      [occurrence(salary, "2026-11", { amountMinor: 110_000 })],
    );

    expect(recurringMonth(state, "2026-11")).toEqual({
      month: "2026-11",
      incomeMinor: 110_000,
      expenseMinor: 23_000,
      freeMinor: 87_000,
      estimated: false,
    });
  });

  it("em mês passado conta só o que está gravado, sem a regra somar de novo", () => {
    const rent = series({});
    const state = stateWith(
      [salary, rent],
      [occurrence(salary, "2026-09"), occurrence(rent, "2026-09", { amountMinor: 25_000 })],
    );

    expect(recurringMonth(state, "2026-09")).toMatchObject({
      incomeMinor: 100_000,
      expenseMinor: 25_000,
    });
  });

  it("ocorrência apagada de um mês passado não volta pela regra", () => {
    const state = stateWith([salary], [occurrence(salary, "2026-09", { deletedAt: DELETED_AT })]);

    expect(recurringMonth(state, "2026-09").incomeMinor).toBe(0);
  });

  it("série pausada ou apagada depois mantém o que já tinha gravado no mês", () => {
    // A renda de setembro existiu; pausar a série em novembro não a desfaz.
    const paused = { ...salary, active: false };
    const gone = series({ deletedAt: DELETED_AT });
    const state = stateWith(
      [paused, gone],
      [occurrence(paused, "2026-09"), occurrence(gone, "2026-09")],
    );

    expect(recurringMonth(state, "2026-09")).toMatchObject({
      incomeMinor: 100_000,
      expenseMinor: 23_000,
    });
    // Outubro não foi gravado e a série não gera mais: nada.
    expect(recurringMonth(state, "2026-10").incomeMinor).toBe(0);
  });

  it("ocorrência vencida ainda sem linha conta pelo valor que a materialização vai gravar", () => {
    // Aparelho que ficou fechado: setembro venceu e ninguém materializou.
    expect(recurringMonth(stateWith([salary]), "2026-09").incomeMinor).toBe(100_000);
  });

  it("mês anterior ao começo da série fica zerado", () => {
    expect(recurringMonth(stateWith([salary, series({})]), "2026-05")).toMatchObject({
      incomeMinor: 0,
      expenseMinor: 0,
    });
  });
});
