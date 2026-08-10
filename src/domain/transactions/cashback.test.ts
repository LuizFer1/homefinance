import { describe, expect, it } from "vitest";
import { offersCashback } from "./cashback";

describe("offersCashback", () => {
  it("oferece para credito e debito", () => {
    expect(offersCashback("credit", "expense")).toBe(true);
    expect(offersCashback("debit", "expense")).toBe(true);
  });

  it("nao oferece para dinheiro, pix e outros", () => {
    expect(offersCashback("cash", "expense")).toBe(false);
    expect(offersCashback("pix", "expense")).toBe(false);
    expect(offersCashback("other", "expense")).toBe(false);
  });

  it("nunca oferece em receita, nem com cartao", () => {
    // So despesa pode gerar retorno.
    expect(offersCashback("credit", "income")).toBe(false);
    expect(offersCashback("debit", "income")).toBe(false);
  });

  it("nao oferece sem forma de pagamento escolhida", () => {
    expect(offersCashback(null, "expense")).toBe(false);
  });

  it("nao oferece para kind desconhecido vindo de uma versao futura", () => {
    // O fold aceita o valor de proposito; a regra e conservadora e so liga o
    // campo para os dois tipos que ela conhece.
    expect(offersCashback("cripto", "expense")).toBe(false);
  });
});
