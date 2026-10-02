import { describe, expect, it } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { RecurrenceAdjustment } from "../model/recurrence-adjustment";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { adjustmentId, adjustmentsOf, amountFor } from "./adjustments";

const SERIE = { id: "SERIE-1", amountMinor: 300_000 };

function ajuste(
  fromPeriod: string,
  amountMinor: number,
  over: Partial<RecurrenceAdjustment> = {},
): RecurrenceAdjustment {
  return {
    ...ALIVE,
    id: adjustmentId("SERIE-1", fromPeriod),
    recurrenceId: "SERIE-1",
    fromPeriod,
    amountMinor,
    ...over,
  };
}

describe("adjustmentId", () => {
  it("é determinístico por série e competência", () => {
    expect(adjustmentId("SERIE-1", "2027-01")).toBe(adjustmentId("SERIE-1", "2027-01"));
    expect(adjustmentId("SERIE-1", "2027-01")).not.toBe(adjustmentId("SERIE-1", "2027-02"));
    expect(adjustmentId("SERIE-1", "2027-01")).not.toBe(adjustmentId("SERIE-2", "2027-01"));
  });
});

describe("amountFor", () => {
  it("sem reajuste vale o valor-base", () => {
    expect(amountFor(SERIE, [], "2027-06")).toBe(300_000);
  });

  it("vale a partir da competência do reajuste, inclusive", () => {
    const lista = [ajuste("2027-01", 350_000)];
    expect(amountFor(SERIE, lista, "2026-12")).toBe(300_000);
    expect(amountFor(SERIE, lista, "2027-01")).toBe(350_000);
    expect(amountFor(SERIE, lista, "2027-08")).toBe(350_000);
  });

  it("com vários, vale o mais recente até a competência, em qualquer ordem", () => {
    const lista = [ajuste("2028-01", 400_000), ajuste("2027-01", 350_000)];
    expect(amountFor(SERIE, lista, "2027-06")).toBe(350_000);
    expect(amountFor(SERIE, lista, "2028-01")).toBe(400_000);
  });

  it("reajuste apagado não vale", () => {
    const lista = [ajuste("2027-01", 350_000, { deletedAt: DELETED_AT })];
    expect(amountFor(SERIE, lista, "2027-06")).toBe(300_000);
  });

  it("reajuste de outra série não interfere", () => {
    const lista = [ajuste("2027-01", 350_000, { recurrenceId: "OUTRA" })];
    expect(amountFor(SERIE, lista, "2027-06")).toBe(300_000);
  });
});

describe("adjustmentsOf", () => {
  it("só os vivos da série, do mais antigo para o mais novo", () => {
    const novo = ajuste("2028-01", 400_000);
    const velho = ajuste("2027-01", 350_000);
    const apagado = ajuste("2027-06", 360_000, { deletedAt: DELETED_AT });
    const outra = ajuste("2027-03", 1, { id: "X", recurrenceId: "OUTRA" });
    const state: AppState = {
      ...EMPTY_APP_STATE,
      recurrenceAdjustments: {
        [novo.id]: novo,
        [velho.id]: velho,
        [apagado.id]: apagado,
        [outra.id]: outra,
      },
    };

    expect(adjustmentsOf(state, "SERIE-1")).toEqual([velho, novo]);
  });
});
