import { describe, expect, it } from "vitest";
import type { AppState } from "../model/app-state";
import { EMPTY_APP_STATE } from "../model/app-state";
import { filterByMonth } from "../projections/breakdown";
import { forecast } from "../projections/forecast";
import { GRAFITE_TODAY, grafiteState, PMP } from "../projections/grafite.fake";
import { listTransactions, totals } from "../projections/selectors";
import { card, legacyCard, purchase, series } from "./fixtures.fake";
import { upcomingInvoices } from "./upcoming-invoices";

const TODAY = "2026-11-19";

function stateOf(
  methods: AppState["paymentMethods"][string][],
  rows: AppState["transactions"][string][],
  recurrences: AppState["recurrences"][string][] = [],
): AppState {
  return {
    ...EMPTY_APP_STATE,
    paymentMethods: Object.fromEntries(methods.map((m) => [m.id, m])),
    transactions: Object.fromEntries(rows.map((r) => [r.id, r])),
    recurrences: Object.fromEntries(recurrences.map((r) => [r.id, r])),
  };
}

describe("upcomingInvoices: fixture grafite", () => {
  it("fatura Mercado Pago: vence ter, 8 dez, aberta, R$ 515,15, 15% da renda", () => {
    expect(upcomingInvoices(grafiteState(), GRAFITE_TODAY, 30)).toEqual([
      {
        cardId: PMP,
        cardName: "Mercado Pago",
        icon: "credit-card",
        color: "violet",
        month: "2026-11",
        dueOn: "2026-12-08",
        status: "open",
        totalMinor: 51_515,
        incomePercent: 15,
      },
    ]);
  });

  it("nunca soma em despesa: totais e previsão de novembro não mudam", () => {
    const state = grafiteState();
    expect(upcomingInvoices(state, GRAFITE_TODAY, 30)).toHaveLength(1);
    const items = listTransactions(state);
    expect(totals(filterByMonth(items, "2026-11")).expenseMinor).toBe(311_341);
    expect(forecast(items, state, GRAFITE_TODAY)?.expectedExpenseMinor).toBe(445_927);
  });
});

describe("upcomingInvoices", () => {
  // Fecha dia 5, vence dia 12: a de novembro (compras de 6/10 a 5/11) vence 12/11.
  const C = card("C", { name: "Nubank", closingDay: 5, dueDay: 12 });

  it("janela de hoje (inclusive) até hoje + 30", () => {
    const state = stateOf(
      [C],
      [
        purchase("a", "C", "2026-11-01"), // fatura de novembro, vence 12/11: já passou
        purchase("b", "C", "2026-11-10"), // fatura de dezembro, vence 12/12: entra
        purchase("c", "C", "2026-12-10"), // fatura de janeiro, vence 12/01: fora
      ],
    );
    expect(upcomingInvoices(state, TODAY, 30).map((i) => i.dueOn)).toEqual(["2026-12-12"]);
    // Vence hoje: ainda entra. No dia seguinte sai, e a de 12/01 (hoje + 30) entra.
    expect(upcomingInvoices(state, "2026-12-12", 30).map((i) => i.dueOn)).toEqual(["2026-12-12"]);
    expect(upcomingInvoices(state, "2026-12-13", 30).map((i) => i.dueOn)).toEqual(["2027-01-12"]);
  });

  it("fechada continua até vencer; a aberta é a do ciclo de hoje", () => {
    // Fecha dia 10, vence dia 25. Em 25/11: a de novembro fechou 10/11 e vence hoje; a de
    // dezembro está aberta e vence 25/12 (hoje + 30).
    const D = card("D", { closingDay: 10, dueDay: 25 });
    const state = stateOf(
      [D],
      [purchase("a", "D", "2026-11-05"), purchase("b", "D", "2026-11-15")],
    );
    expect(
      upcomingInvoices(state, "2026-11-25", 30).map((i) => [i.dueOn, i.status, i.totalMinor]),
    ).toEqual([
      ["2026-11-25", "closed", 1_000],
      ["2026-12-25", "open", 1_000],
    ]);
  });

  it("total zero ou negativo não entra (estorno, fatura vazia)", () => {
    const state = stateOf(
      [C],
      [
        purchase("a", "C", "2026-11-10", 1_000),
        purchase("b", "C", "2026-11-12", 1_500, { kind: "income" }),
      ],
    );
    expect(upcomingInvoices(state, TODAY, 30)).toEqual([]);
  });

  it("cartão por completar, apagado ou de outro tipo não tem fatura", () => {
    const pix = { ...card("P"), kind: "pix" as const };
    const gone = { ...card("G"), deletedAt: "x" };
    const state = stateOf(
      [legacyCard("L"), pix, gone],
      ["L", "P", "G"].map((id) => purchase(`p${id}`, id, "2026-11-10")),
    );
    expect(upcomingInvoices(state, TODAY, 30)).toEqual([]);
  });

  it("ordena por vencimento entre cartões", () => {
    const early = card("E", { closingDay: 10, dueDay: 20 });
    const state = stateOf(
      [C, early],
      [purchase("a", "C", "2026-11-10"), purchase("b", "E", "2026-11-05")],
    );
    expect(upcomingInvoices(state, TODAY, 30).map((i) => i.cardId)).toEqual(["E", "C"]);
  });

  it("% da renda só com renda fixa no mês do vencimento", () => {
    const salary = series("S", null, {
      kind: "income",
      amountMinor: 400_000,
      scheduleN: 5,
      startOn: "2026-12-05",
    });
    const rows = [purchase("a", "C", "2026-11-10", 130_000)];
    expect(upcomingInvoices(stateOf([C], rows), TODAY, 30)[0]?.incomePercent).toBeNull();
    // 130000 ÷ 400000 = 32,5% → 33.
    expect(upcomingInvoices(stateOf([C], rows, [salary]), TODAY, 30)[0]?.incomePercent).toBe(33);
  });
});
