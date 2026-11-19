import { describe, expect, it } from "vitest";
import { series } from "../cards/fixtures.fake";
import type { AppState } from "../model/app-state";
import { tx } from "../reserves/fixtures.fake";
import { fixedVariable } from "./fixed-variable";
import { forecast } from "./forecast";
import { committedPercent, recurringMonth } from "./free-money";
import { CAT, GRAFITE_TODAY, grafiteState, occurrenceIdOf, UL } from "./grafite.fake";
import { listTransactions } from "./selectors";

function fixedVariableOf(state: AppState, month = "2026-11") {
  return fixedVariable(listTransactions(state), state, month);
}

describe("fixedVariable: tabela 3.2 contra a fixture grafite", () => {
  it("novembro: R$ 876 fixos · R$ 2.237 variáveis", () => {
    expect(fixedVariableOf(grafiteState())).toEqual({ fixedMinor: 87_600, variableMinor: 223_741 });
  });

  it("outubro: só a Cadeira é fixa", () => {
    expect(fixedVariableOf(grafiteState(), "2026-10")).toEqual({
      fixedMinor: 5_052,
      variableMinor: 361_148,
    });
  });
});

describe("fixedVariable", () => {
  it("recorrência apagada conta como variável", () => {
    const state = grafiteState();
    const rcon = state.recurrences.RCON;
    if (rcon === undefined) throw new Error("fixture sem RCON");
    state.recurrences.RCON = { ...rcon, deletedAt: rcon.updatedAt };
    expect(fixedVariableOf(state)).toEqual({
      fixedMinor: 87_600 - 53_901,
      variableMinor: 223_741 + 53_901,
    });
  });

  it("série desconhecida (ainda não sincronizada) conta como variável", () => {
    const state = grafiteState();
    delete state.recurrences.RCON;
    expect(fixedVariableOf(state).variableMinor).toBe(223_741 + 53_901);
  });

  it("série viva sem `variable` é fixa, mesmo pausada", () => {
    const state = grafiteState();
    const rcon = state.recurrences.RCON;
    if (rcon === undefined) throw new Error("fixture sem RCON");
    state.recurrences.RCON = { ...rcon, active: false };
    expect(fixedVariableOf(state).fixedMinor).toBe(87_600);
  });

  it("valor varia materializado é variável, mas não avulso", () => {
    const state = grafiteState();
    state.recurrences.RLUZ = series("RLUZ", null, {
      kind: "expense",
      description: "Luz",
      categoryId: CAT.contas,
      amountMinor: 12_000,
      scheduleN: 12,
      startOn: "2026-11-12",
      variable: true,
      userId: UL,
    });
    const id = occurrenceIdOf("RLUZ", "2026-11");
    state.transactions[id] = tx(id, "expense", 12_000, "2026-11-12", CAT.contas, {
      recurrenceId: "RLUZ",
      occurrenceKey: "RLUZ:2026-11",
      userId: UL,
    });

    expect(fixedVariableOf(state)).toEqual({ fixedMinor: 87_600, variableMinor: 235_741 });
    // A média avulsa da previsão não muda: a Luz já está na despesa lançada.
    const f = forecast(listTransactions(state), state, GRAFITE_TODAY);
    expect(f?.casualMinor).toBe(223_741);
  });

  it("parcela que continua em dezembro entra no comprometido e não na fixa de novembro", () => {
    const state = grafiteState();
    const rcad = state.recurrences.RCAD;
    if (rcad === undefined) throw new Error("fixture sem RCAD");
    state.recurrences.RCAD = { ...rcad, endOn: "2026-12-21" };
    expect(recurringMonth(state, "2026-12").expenseMinor).toBe(92_652);
    expect(fixedVariableOf(state).fixedMinor).toBe(87_600);
  });

  it("receita, transferência e oculto ficam de fora", () => {
    const state = grafiteState();
    state.transactions.T = tx("T", "expense", 9_999, "2026-11-10", null, {
      reportState: "transfer",
    });
    state.transactions.H = tx("H", "expense", 9_999, "2026-11-10", null, { reportState: "hidden" });
    expect(fixedVariableOf(state)).toEqual({ fixedMinor: 87_600, variableMinor: 223_741 });
  });
});

describe("committedPercent", () => {
  it("fixture: 87600 de 350000 da renda fixa de dezembro = 25%", () => {
    const december = recurringMonth(grafiteState(), "2026-12");
    expect(december.expenseMinor).toBe(87_600);
    expect(december.incomeMinor).toBe(350_000);
    expect(committedPercent(december)).toBe(25);
  });

  it("sem receita recorrente não há porcentagem", () => {
    expect(
      committedPercent({
        month: "2026-12",
        incomeMinor: 0,
        expenseMinor: 1_000,
        freeMinor: -1_000,
        estimated: false,
      }),
    ).toBeNull();
  });

  it("passa de 100% sem travar: a barra é que trava", () => {
    expect(
      committedPercent({
        month: "2026-12",
        incomeMinor: 1_000,
        expenseMinor: 1_500,
        freeMinor: -500,
        estimated: false,
      }),
    ).toBe(150);
  });
});
