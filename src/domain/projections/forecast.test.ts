import { describe, expect, it } from "vitest";
import { series } from "../cards/fixtures.fake";
import type { AppState } from "../model/app-state";
import { tx } from "../reserves/fixtures.fake";
import { forecast, roundToTens, savingsRate, zeroAllowance } from "./forecast";
import { CAT, GRAFITE_TODAY, grafiteState, occurrenceIdOf, UL } from "./grafite.fake";
import { listTransactions } from "./selectors";

/** Previsão da fixture num `today` qualquer; falha o teste se não houver previsão. */
function forecastOf(state: AppState, today = GRAFITE_TODAY) {
  const result = forecast(listTransactions(state), state, today);
  if (result === null) throw new Error("sem previsão");
  return result;
}

/** Série "valor varia" Luz, R$ 120, dia 12 de novembro (spec 5.9). */
function withLuz(state: AppState, materialized: boolean): AppState {
  state.recurrences.RLUZ = series("RLUZ", null, {
    kind: "expense",
    description: "Luz",
    categoryId: CAT.contas,
    amountMinor: 12_000,
    scheduleType: "dayOfMonth",
    scheduleN: 12,
    startOn: "2026-11-12",
    variable: true,
    userId: UL,
  });
  if (materialized) {
    const id = occurrenceIdOf("RLUZ", "2026-11");
    state.transactions[id] = tx(id, "expense", 12_000, "2026-11-12", CAT.contas, {
      recurrenceId: "RLUZ",
      occurrenceKey: "RLUZ:2026-11",
      userId: UL,
    });
  }
  return state;
}

describe("forecast: tabela 3.2 da spec contra a fixture grafite", () => {
  const f = forecastOf(grafiteState());

  it("hoje é dia 19 de 30: faltam 11 dias", () => {
    expect(f.month).toBe("2026-11");
    expect(f.day).toBe(19);
    expect(f.daysInMonth).toBe(30);
    expect(f.remainingDays).toBe(11);
  });

  it("lançado no mês: receita 350000, despesa 311341", () => {
    expect(f.incomeMinor).toBe(350_000);
    expect(f.expenseMinor).toBe(311_341);
  });

  it("média diária avulsa = div_round(223741, 19) = 11776 (~R$ 118)", () => {
    expect(f.casualMinor).toBe(223_741);
    expect(f.casualDailyMinor).toBe(11_776);
  });

  it("recorrentes por vir: só a Cadeira de 21/11 (5052)", () => {
    expect(f.upcomingIncomeMinor).toBe(0);
    expect(f.upcomingExpenseMinor).toBe(5_052);
  });

  it("variável projetado = div_round(223741 × 11, 19) = 129534", () => {
    expect(f.projectedCasualMinor).toBe(129_534);
  });

  it("despesa prevista 445927 → ~R$ 4.460", () => {
    expect(f.expectedIncomeMinor).toBe(350_000);
    expect(f.expectedExpenseMinor).toBe(445_927);
    expect(roundToTens(f.expectedExpenseMinor)).toBe(446_000);
  });

  it("sobra prevista −95927 → vão faltar ~R$ 960", () => {
    expect(f.expectedSurplusMinor).toBe(-95_927);
    expect(roundToTens(f.expectedSurplusMinor)).toBe(-96_000);
  });

  it("taxa no ritmo = round(−27,4) = −27%", () => {
    expect(f.expectedSavingsRate).toBe(-27);
  });

  it("taxa até agora = round(11,05) = 11%", () => {
    expect(savingsRate(f.incomeMinor, f.expenseMinor)).toBe(11);
  });

  it("fechar no zero = piso((38659 − 5052) ÷ 11) em reais = R$ 30/dia", () => {
    // Arredondando daria 31: o teto de gasto nunca é superestimado.
    expect(zeroAllowance(f)).toBe(3_000);
  });
});

describe("forecast", () => {
  it("some até o dia 5: a média de poucos dias é instável", () => {
    const state = grafiteState();
    const items = listTransactions(state);
    expect(forecast(items, state, "2026-11-01")).toBeNull();
    expect(forecast(items, state, "2026-11-05")).toBeNull();
    expect(forecast(items, state, "2026-11-06")).not.toBeNull();
  });

  it("valor varia materializado é despesa lançada, mas não entra na média avulsa", () => {
    const f = forecastOf(withLuz(grafiteState(), true));
    expect(f.casualMinor).toBe(223_741);
    expect(f.casualDailyMinor).toBe(11_776);
    expect(f.expenseMinor).toBe(311_341 + 12_000);
    // Já gravada: a projeção não a estima de novo.
    expect(f.upcomingExpenseMinor).toBe(5_052);
  });

  it("valor varia ainda sem linha entra na previsão pela estimativa, não pela média", () => {
    const f = forecastOf(withLuz(grafiteState(), false));
    expect(f.casualMinor).toBe(223_741);
    expect(f.expenseMinor).toBe(311_341);
    // Sem ocorrência confirmada anterior, a estimativa é o valor da série.
    expect(f.upcomingExpenseMinor).toBe(5_052 + 12_000);
  });

  it("lançamento com data futura no mês soma em D e não na média", () => {
    const state = grafiteState();
    state.transactions["1125-1-FUTURO"] = tx(
      "1125-1-FUTURO",
      "expense",
      10_000,
      "2026-11-25",
      null,
    );
    const f = forecastOf(state);
    expect(f.expenseMinor).toBe(321_341);
    expect(f.casualMinor).toBe(223_741);
    expect(f.projectedCasualMinor).toBe(129_534);
    expect(f.expectedExpenseMinor).toBe(455_927);
  });

  it("ocorrência vencida ainda sem linha entra uma vez, pelo valor da série", () => {
    const state = grafiteState();
    delete state.transactions[occurrenceIdOf("RCON", "2026-11")];
    const f = forecastOf(state);
    expect(f.expenseMinor).toBe(311_341 - 53_901);
    expect(f.upcomingExpenseMinor).toBe(5_052 + 53_901);
    expect(f.expectedExpenseMinor).toBe(445_927);
  });

  it("sem receita, nem lançada nem por vir, não tem taxa no ritmo", () => {
    const state = grafiteState();
    delete state.transactions[occurrenceIdOf("RSAL", "2026-11")];
    delete state.recurrences.RSAL;
    const f = forecastOf(state);
    expect(f.expectedIncomeMinor).toBe(0);
    expect(f.expectedSavingsRate).toBeNull();
  });

  it("transferência e oculto não contam em nada", () => {
    const state = grafiteState();
    state.transactions["1110-1-TRANSF"] = tx(
      "1110-1-TRANSF",
      "expense",
      99_999,
      "2026-11-10",
      null,
      {
        reportState: "transfer",
      },
    );
    const f = forecastOf(state);
    expect(f.expenseMinor).toBe(311_341);
    expect(f.casualMinor).toBe(223_741);
  });
});

describe("zeroAllowance", () => {
  it("no último dia do mês não há dia restante para dividir", () => {
    const f = forecastOf(grafiteState(), "2026-11-30");
    expect(f.remainingDays).toBe(0);
    expect(zeroAllowance(f)).toBeNull();
  });

  it("contas por vir acima do saldo dão zero ou menos: a tela troca o texto", () => {
    const state = grafiteState();
    state.transactions["1118-3-GRANDE"] = tx(
      "1118-3-GRANDE",
      "expense",
      40_000,
      "2026-11-18",
      null,
    );
    const allowance = zeroAllowance(forecastOf(state));
    expect(allowance).not.toBeNull();
    expect(allowance as number).toBeLessThanOrEqual(0);
  });
});

describe("savingsRate", () => {
  it("sem receita não tem taxa", () => {
    expect(savingsRate(0, 0)).toBeNull();
    expect(savingsRate(0, 5_000)).toBeNull();
  });

  it("gastar mais que entrou dá taxa negativa", () => {
    expect(savingsRate(1_000, 1_500)).toBe(-50);
  });

  it("outubro da fixture: round(27,8) = 28%", () => {
    expect(savingsRate(507_229, 366_200)).toBe(28);
  });
});

describe("roundToTens", () => {
  it("arredonda o módulo à dezena de reais e mantém o sinal", () => {
    expect(roundToTens(95_927)).toBe(96_000);
    expect(roundToTens(-95_927)).toBe(-96_000);
    expect(roundToTens(-500)).toBe(-1_000);
    expect(roundToTens(499)).toBe(0);
    expect(roundToTens(0)).toBe(0);
  });
});
