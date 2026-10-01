import { describe, expect, it } from "vitest";
import { applyPercent, formatPercent, parsePercent, percentChange } from "./adjust";

describe("applyPercent", () => {
  it("aplica aumento sem erro de ponto flutuante", () => {
    expect(applyPercent(80_000, 12)).toBe(89_600);
  });

  it("aplica redução", () => {
    expect(applyPercent(100_000, -10)).toBe(90_000);
  });

  it("aceita percentual decimal", () => {
    expect(applyPercent(300_000, 12.5)).toBe(337_500);
  });

  it("arredonda para o centavo mais próximo", () => {
    expect(applyPercent(333, 10)).toBe(366);
    expect(applyPercent(1_005, 50)).toBe(1_508);
  });
});

describe("percentChange", () => {
  it("calcula a variação entre dois valores", () => {
    expect(percentChange(300_000, 350_000)).toBeCloseTo(16.6667, 3);
    expect(percentChange(100_000, 90_000)).toBeCloseTo(-10, 6);
  });

  it("base zero não tem variação", () => {
    expect(percentChange(0, 100)).toBe(0);
  });
});

describe("parsePercent", () => {
  it("lê inteiro, decimal com vírgula ou ponto e sinal", () => {
    expect(parsePercent("12")).toBe(12);
    expect(parsePercent(" 12,5 ")).toBe(12.5);
    expect(parsePercent("3.25")).toBe(3.25);
    expect(parsePercent("-10")).toBe(-10);
    expect(parsePercent("+7")).toBe(7);
  });

  it("recusa o que não é número", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
    expect(parsePercent("12,")).toBeNull();
    expect(parsePercent("1,2,3")).toBeNull();
  });
});

describe("formatPercent", () => {
  it("formata com sinal e até duas casas", () => {
    expect(formatPercent(50 / 3)).toBe("+16,67%");
    expect(formatPercent(12)).toBe("+12%");
    expect(formatPercent(-10)).toBe("-10%");
    expect(formatPercent(0)).toBe("0%");
  });
});
