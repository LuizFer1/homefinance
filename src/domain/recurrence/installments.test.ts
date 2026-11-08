import { describe, expect, it } from "vitest";
import {
  installmentDescription,
  installmentRule,
  maxInstallmentsFor,
  splitInstallments,
} from "./installments";

describe("splitInstallments", () => {
  it("divisão exata deixa todas as parcelas iguais", () => {
    expect(splitInstallments(30_000, 3)).toEqual({ amountMinor: 10_000, firstAmountMinor: 10_000 });
  });

  it("a sobra fica na 1ª parcela e a soma bate com o total", () => {
    const split = splitInstallments(10_000, 3);
    expect(split).toEqual({ amountMinor: 3_333, firstAmountMinor: 3_334 });
    expect(split.firstAmountMinor + split.amountMinor * 2).toBe(10_000);
  });

  it("aceita os limites 2 e 48", () => {
    expect(splitInstallments(3, 2)).toEqual({ amountMinor: 1, firstAmountMinor: 2 });
    expect(splitInstallments(4_800, 48).amountMinor).toBe(100);
  });

  it("recusa parcela de zero centavo e contagem fora do intervalo", () => {
    expect(() => splitInstallments(2, 3)).toThrow();
    expect(() => splitInstallments(1_000, 1)).toThrow();
    expect(() => splitInstallments(1_000, 49)).toThrow();
    expect(() => splitInstallments(1_000, 2.5)).toThrow();
  });
});

describe("maxInstallmentsFor", () => {
  it("é 48, ou o total em centavos quando menor", () => {
    expect(maxInstallmentsFor(100_000)).toBe(48);
    expect(maxInstallmentsFor(5)).toBe(5);
  });
});

describe("installmentRule", () => {
  it("mensal no dia da compra, terminando na última parcela", () => {
    expect(installmentRule("2026-11-15", 3)).toEqual({
      frequency: "monthly",
      scheduleType: "dayOfMonth",
      scheduleN: 15,
      endOn: "2027-01-15",
      variable: false,
    });
  });

  it("compra no dia 31 termina no último dia do mês curto", () => {
    expect(installmentRule("2026-12-31", 3).endOn).toBe("2027-02-28");
  });
});

describe("installmentDescription", () => {
  it("usa o mesmo sufixo da importação", () => {
    expect(installmentDescription("Geladeira", 10)).toBe("Geladeira (10x)");
  });
});
