import { describe, expect, it } from "vitest";
import { shiftMonth } from "../dates/calendar";
import { stableEntityId } from "../ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import type { RecurrenceAdjustment } from "../model/recurrence-adjustment";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { periodChoices, planAdjustment } from "./adjust-plan";
import { adjustmentId } from "./adjustments";
import { occurrenceKey } from "./schedule";

const SALARIO: Recurrence = {
  ...ALIVE,
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

function ocorrencia(
  period: string,
  amountMinor = 500_000,
  over: Partial<Transaction> = {},
): Transaction {
  const key = occurrenceKey(SALARIO.id, period);
  return {
    ...ALIVE,
    id: stableEntityId(key),
    kind: "income",
    description: "Salário",
    amountMinor,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: `${period}-05`,
    userId: null,
    recurrenceId: SALARIO.id,
    occurrenceKey: key,
    ...over,
  };
}

function ajuste(fromPeriod: string, amountMinor: number): RecurrenceAdjustment {
  return {
    ...ALIVE,
    id: adjustmentId(SALARIO.id, fromPeriod),
    recurrenceId: SALARIO.id,
    fromPeriod,
    amountMinor,
  };
}

function estado(
  transactions: Transaction[],
  adjustments: RecurrenceAdjustment[] = [],
  series: Recurrence = SALARIO,
): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: { [series.id]: series },
    transactions: Object.fromEntries(transactions.map((t) => [t.id, t])),
    recurrenceAdjustments: Object.fromEntries(adjustments.map((a) => [a.id, a])),
  };
}

const LANCADAS = [ocorrencia("2026-06"), ocorrencia("2026-07"), ocorrencia("2026-08")];

describe("planAdjustment", () => {
  it("série inexistente não tem plano", () => {
    expect(
      planAdjustment(EMPTY_APP_STATE, {
        recurrenceId: "NADA",
        fromPeriod: "2026-09",
        amountMinor: 1,
      }),
    ).toBeNull();
  });

  it("reajuste futuro não toca o que já foi lançado", () => {
    const plan = planAdjustment(estado(LANCADAS), {
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-09",
      amountMinor: 550_000,
    });

    expect(plan).toEqual({
      adjustmentId: adjustmentId(SALARIO.id, "2026-09"),
      baseMinor: 500_000,
      updates: [],
      kept: [],
    });
  });

  it("retroativo atualiza as ocorrências desde a competência", () => {
    const plan = planAdjustment(estado(LANCADAS), {
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-07",
      amountMinor: 550_000,
    });

    expect(plan?.updates.map((u) => [u.transaction.occurredOn, u.amountMinor])).toEqual([
      ["2026-07-05", 550_000],
      ["2026-08-05", 550_000],
    ]);
    expect(plan?.kept).toEqual([]);
  });

  it("mantém a ocorrência editada à mão", () => {
    const editada = ocorrencia("2026-08", 520_000);
    const plan = planAdjustment(estado([...LANCADAS.slice(0, 2), editada]), {
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-07",
      amountMinor: 550_000,
    });

    expect(plan?.updates.map((u) => u.transaction.occurredOn)).toEqual(["2026-07-05"]);
    expect(plan?.kept).toEqual([editada]);
  });

  it("ignora ocorrência apagada", () => {
    const apagada = ocorrencia("2026-08", 500_000, { deletedAt: DELETED_AT });
    const plan = planAdjustment(estado([...LANCADAS.slice(0, 2), apagada]), {
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-07",
      amountMinor: 550_000,
    });

    expect(plan?.updates.map((u) => u.transaction.occurredOn)).toEqual(["2026-07-05"]);
    expect(plan?.kept).toEqual([]);
  });

  it("reajuste posterior continua mandando nos meses dele", () => {
    const state = estado(
      [ocorrencia("2026-07"), ocorrencia("2026-08", 600_000)],
      [ajuste("2026-08", 600_000)],
    );
    const plan = planAdjustment(state, {
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-07",
      amountMinor: 550_000,
    });

    expect(plan?.updates.map((u) => u.transaction.occurredOn)).toEqual(["2026-07-05"]);
    expect(plan?.kept).toEqual([]);
  });

  it("substituir reajuste na mesma competência atualiza quem seguia o anterior", () => {
    const state = estado(
      [ocorrencia("2026-06"), ocorrencia("2026-07", 550_000), ocorrencia("2026-08", 550_000)],
      [ajuste("2026-07", 550_000)],
    );
    const plan = planAdjustment(state, {
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-07",
      amountMinor: 560_000,
    });

    expect(plan?.baseMinor).toBe(500_000);
    expect(plan?.updates.map((u) => [u.transaction.occurredOn, u.amountMinor])).toEqual([
      ["2026-07-05", 560_000],
      ["2026-08-05", 560_000],
    ]);
  });

  it("ocorrência que já tem o valor novo não aparece como mantida", () => {
    const plan = planAdjustment(estado([ocorrencia("2026-07"), ocorrencia("2026-08", 550_000)]), {
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-07",
      amountMinor: 550_000,
    });

    expect(plan?.updates.map((u) => u.transaction.occurredOn)).toEqual(["2026-07-05"]);
    expect(plan?.kept).toEqual([]);
  });

  it("atualizadas e mantidas saem em ordem de data", () => {
    const plan = planAdjustment(
      estado([
        ocorrencia("2026-08"),
        ocorrencia("2026-06"),
        ocorrencia("2026-10", 530_000),
        ocorrencia("2026-07"),
        ocorrencia("2026-09", 520_000),
      ]),
      { recurrenceId: SALARIO.id, fromPeriod: "2026-06", amountMinor: 550_000 },
    );

    expect(plan?.updates.map((u) => u.transaction.occurredOn)).toEqual([
      "2026-06-05",
      "2026-07-05",
      "2026-08-05",
    ]);
    expect(plan?.kept.map((t) => t.occurredOn)).toEqual(["2026-09-05", "2026-10-05"]);
  });

  it("a base é o valor vigente antes da competência, já reajustado", () => {
    const plan = planAdjustment(estado(LANCADAS, [ajuste("2026-07", 550_000)]), {
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-09",
      amountMinor: 600_000,
    });

    expect(plan?.baseMinor).toBe(550_000);
  });
});

describe("periodChoices", () => {
  it("padrão é a primeira competência sem lançamento; até 12 depois", () => {
    const { periods, initial } = periodChoices(estado(LANCADAS), SALARIO);

    expect(initial).toBe("2026-09");
    expect(periods[0]).toBe("2026-06");
    expect(periods.at(-1)).toBe("2027-09");
    expect(periods).toHaveLength(16);
  });

  it("oferece no máximo 6 competências antes da padrão", () => {
    const desde2025 = { ...SALARIO, startOn: "2025-01-05" };
    const lancadas: Transaction[] = [];
    for (let p = "2025-01"; p <= "2026-08"; p = shiftMonth(p, 1)) lancadas.push(ocorrencia(p));

    const { periods, initial } = periodChoices(estado(lancadas, [], desde2025), desde2025);

    expect(initial).toBe("2026-09");
    expect(periods[0]).toBe("2026-03");
  });

  it("ocorrência apagada conta como lançada", () => {
    const apagada = ocorrencia("2026-06", 500_000, { deletedAt: DELETED_AT });
    expect(periodChoices(estado([apagada]), SALARIO).initial).toBe("2026-07");
  });

  it("não passa do fim da série", () => {
    const comFim = { ...SALARIO, endOn: "2026-12-05" };
    const { periods, initial } = periodChoices(estado([], [], comFim), comFim);

    expect(initial).toBe("2026-06");
    expect(periods).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });

  it("série encerrada e toda lançada: padrão é a última competência", () => {
    const comFim = { ...SALARIO, endOn: "2026-08-05" };
    const { periods, initial } = periodChoices(estado(LANCADAS, [], comFim), comFim);

    expect(initial).toBe("2026-08");
    expect(periods).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("segue o passo da frequência", () => {
    const bimestral: Recurrence = { ...SALARIO, frequency: "bimonthly", startOn: "2026-01-05" };
    const { periods } = periodChoices(estado([], [], bimestral), bimestral);

    expect(periods.slice(0, 3)).toEqual(["2026-01", "2026-03", "2026-05"]);
  });
});
