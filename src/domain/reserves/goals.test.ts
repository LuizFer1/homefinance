import { describe, expect, it } from "vitest";
import {
  formatMonths,
  meterFractions,
  monthsCovered,
  projectedCompletion,
  suggestedMonthly,
} from "./goals";

describe("monthsCovered / formatMonths", () => {
  it("trunca em uma casa: nunca promete um mês que não está guardado", () => {
    expect(formatMonths(monthsCovered(1_542_000, 395_000))).toBe("3,9");
    expect(formatMonths(monthsCovered(396, 100))).toBe("3,9"); // 3,96
    expect(formatMonths(monthsCovered(400, 100))).toBe("4,0");
  });

  it("custo zero ou negativo não divide", () => {
    expect(monthsCovered(1000, 0)).toBe(0);
  });
});

describe("meterFractions", () => {
  it("cada segmento é a fração daquele mês coberta", () => {
    expect(meterFractions(3.9)).toEqual([1, 1, 1, 0.9, 0, 0].map((v) => expect.closeTo(v, 5)));
    expect(meterFractions(9)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe("suggestedMonthly", () => {
  it("divide o que falta pelos meses de mês+1 até o prazo, inclusive", () => {
    expect(suggestedMonthly(500_000, 0, "2027-06", "2026-09-20")).toEqual({
      monthlyMinor: 55_556,
      deposits: 9,
    });
  });

  it("prazo no mês atual ou vencido divide por 1", () => {
    expect(suggestedMonthly(1000, 400, "2026-09", "2026-09-20")).toEqual({
      monthlyMinor: 600,
      deposits: 1,
    });
    expect(suggestedMonthly(1000, 400, "2025-01", "2026-09-20")?.deposits).toBe(1);
  });

  it("meta atingida é null", () => {
    expect(suggestedMonthly(1000, 1000, "2027-01", "2026-09-20")).toBeNull();
  });
});

describe("projectedCompletion", () => {
  it("mês atual + ceil(falta / depósito)", () => {
    expect(projectedCompletion(2_370_000, 1_542_000, 50_000, "2026-09-20")).toBe("2028-02");
  });

  it("sem depósito ou meta atingida é null", () => {
    expect(projectedCompletion(1000, 1000, 50, "2026-09-20")).toBeNull();
    expect(projectedCompletion(1000, 0, null, "2026-09-20")).toBeNull();
  });
});
