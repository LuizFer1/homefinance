import { describe, expect, it } from "vitest";
import { MAX_MINOR } from "../money/mask";
import { debtAmountsProblem, isIsoDate, isPositiveMinor } from "./rules";

describe("isIsoDate", () => {
  it("aceita datas que existem e recusa as que não existem", () => {
    expect(isIsoDate("2026-08-01")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-8-1")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("isPositiveMinor", () => {
  it("só inteiro positivo até o teto do campo", () => {
    expect(isPositiveMinor(1)).toBe(true);
    expect(isPositiveMinor(MAX_MINOR)).toBe(true);
    expect(isPositiveMinor(0)).toBe(false);
    expect(isPositiveMinor(-5)).toBe(false);
    expect(isPositiveMinor(1.5)).toBe(false);
    expect(isPositiveMinor(MAX_MINOR + 1)).toBe(false);
    expect(isPositiveMinor(Number.NaN)).toBe(false);
  });
});

describe("debtAmountsProblem", () => {
  it("saldo menor, igual ou zero (quitada) é válido", () => {
    expect(debtAmountsProblem(1000, 400)).toBeNull();
    expect(debtAmountsProblem(1000, 1000)).toBeNull();
    expect(debtAmountsProblem(1000, 0)).toBeNull();
  });

  it("saldo maior que o original é recusado com mensagem clara", () => {
    expect(debtAmountsProblem(1000, 1001)).toBe(
      "O saldo atual não pode ser maior que o valor original.",
    );
  });

  it("original ausente ou saldo inválido", () => {
    expect(debtAmountsProblem(0, 0)).toBe("Informe o valor original da dívida.");
    expect(debtAmountsProblem(1000, -1)).toBe("Informe o saldo atual (zero se já quitou).");
  });
});
