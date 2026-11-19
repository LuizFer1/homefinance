import { describe, expect, it } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { RecurrenceAdjustment } from "../model/recurrence-adjustment";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { type AdjustmentLike, adjustmentId, adjustmentsOf, amountFor } from "./adjustments";

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

  // Regra R (spec do id estável, §4.3 e §8): os mesmos vetores R1, R2 e R4 do hub
  // (`recurrence.rs`, `amount_for::regra_r`). Duas linhas vivas com a mesma competência
  // existem quando um aparelho velho regrava a chave no lugar v1 depois de um novo gravar em
  // v2; app e hub precisam escolher a mesma. O R3 do hub (sem `updatedAt` perde) não tem par
  // aqui: no app toda linha gravada tem versão, e `updatedAt` null é o reajuste simulado, que
  // vence (o oposto, de propósito).
  describe("regra R: mesma competência", () => {
    const SERIES = "01JZ0000000000000000000SR1";
    const ID_A = "01JZ000000000000000000ADJA";
    const ID_B = "01JZ000000000000000000ADJB";
    const H1 = "1793000000000-0000-01JZ0000000000000000000DV1";
    const H2 = "1793000000000-0001-01JZ0000000000000000000DV2";
    const SERIE_R = { id: SERIES, amountMinor: 300_000 };

    const linha = (
      id: string,
      updatedAt: string,
      amountMinor: number,
      deleted = false,
    ): RecurrenceAdjustment =>
      ajuste("2027-01", amountMinor, {
        id,
        recurrenceId: SERIES,
        updatedAt,
        deletedAt: deleted ? updatedAt : null,
      });

    /** Valor em 2027-03 com as linhas nas duas ordens; as duas têm de dar o mesmo. */
    const vencedor = (a: AdjustmentLike, b: AdjustmentLike): number => {
      const ida = amountFor(SERIE_R, [a, b], "2027-03");
      expect(amountFor(SERIE_R, [b, a], "2027-03")).toBe(ida);
      return ida;
    };

    it("R1: vale a de updatedAt maior, mesmo com o id menor", () => {
      expect(vencedor(linha(ID_A, H2, 350_000), linha(ID_B, H1, 360_000))).toBe(350_000);
    });

    it("R2: empate de updatedAt, vale a de id maior", () => {
      expect(vencedor(linha(ID_A, H1, 350_000), linha(ID_B, H1, 360_000))).toBe(360_000);
    });

    it("R4: apagada não concorre, mesmo mais nova", () => {
      expect(vencedor(linha(ID_A, H2, 350_000, true), linha(ID_B, H1, 360_000))).toBe(360_000);
    });

    it("competência maior vence mesmo com updatedAt menor", () => {
      const a = { ...linha(ID_B, H2, 350_000), fromPeriod: "2027-01" };
      const b = { ...linha(ID_A, H1, 360_000), fromPeriod: "2027-02" };
      expect(vencedor(a, b)).toBe(360_000);
    });

    it("o reajuste ainda não gravado (updatedAt null) conta como o mais novo", () => {
      const simulado: AdjustmentLike = { ...linha(ID_A, H1, 350_000), updatedAt: null };
      expect(vencedor(linha(ID_B, H2, 360_000), simulado)).toBe(350_000);
    });
  });

  describe("1ª parcela com a sobra", () => {
    const PARCELADA = {
      id: "SERIE-1",
      amountMinor: 3_333,
      firstAmountMinor: 3_334,
      startOn: "2026-11-15",
      frequency: "monthly" as const,
    };

    it("vale só na competência inicial", () => {
      expect(amountFor(PARCELADA, [], "2026-11")).toBe(3_334);
      expect(amountFor(PARCELADA, [], "2026-12")).toBe(3_333);
    });

    it("reajuste que cobre a competência inicial vence", () => {
      expect(amountFor(PARCELADA, [ajuste("2026-11", 5_000)], "2026-11")).toBe(5_000);
    });

    it("valor inválido vindo do sync degrada para o valor-base", () => {
      expect(amountFor({ ...PARCELADA, firstAmountMinor: 0 }, [], "2026-11")).toBe(3_333);
      expect(amountFor({ ...PARCELADA, firstAmountMinor: 1.5 }, [], "2026-11")).toBe(3_333);
      expect(amountFor({ ...PARCELADA, firstAmountMinor: null }, [], "2026-11")).toBe(3_333);
    });
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
