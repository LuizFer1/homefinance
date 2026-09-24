import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { MINUS, Money, moneyParts, signedBRL } from "./money";

afterEach(cleanup);

describe("moneyParts", () => {
  it("separa inteiro com milhar e centavos com vírgula", () => {
    expect(moneyParts(430530)).toEqual({ sign: "", whole: "4.305", cents: ",30" });
  });

  it("usa o menos tipográfico, não o hífen", () => {
    expect(moneyParts(-25430).sign).toBe(MINUS);
    expect(MINUS).toBe("−");
  });

  it("põe + só quando pedido e só em positivo", () => {
    expect(moneyParts(100, "always").sign).toBe("+");
    expect(moneyParts(0, "always").sign).toBe("");
    expect(moneyParts(100).sign).toBe("");
  });
});

describe("signedBRL", () => {
  it("monta o texto corrido com sinal", () => {
    expect(signedBRL(-25430)).toBe(`${MINUS}R$ 254,30`);
    expect(signedBRL(650000, "always")).toBe("+R$ 6.500,00");
  });
});

describe("Money", () => {
  it("expõe o valor inteiro de uma vez para o leitor de tela", () => {
    render(<Money minor={-100} size={44} testId="saldo" />);

    expect(screen.getByTestId("saldo").textContent).toContain(`${MINUS}R$ 1,00`);
  });
});
