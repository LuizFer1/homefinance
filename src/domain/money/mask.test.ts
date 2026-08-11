import { describe, expect, it } from "vitest";
import { MAX_DIGITS, maskDigits, minorOf, onlyDigits } from "./mask";

/** Simula digitar caractere a caractere num campo controlado pela máscara. */
function digitar(teclas: string): string {
  let digitos = "";
  for (const tecla of teclas) digitos = onlyDigits(maskDigits(digitos) + tecla);
  return digitos;
}

/** Simula o backspace: o navegador entrega o texto exibido com um caractere a menos. */
function apagar(digitos: string): string {
  return onlyDigits(maskDigits(digitos).slice(0, -1));
}

describe("digitação acumulando centavos", () => {
  it("preenche da direita para a esquerda", () => {
    expect(maskDigits(digitar("1"))).toBe("0,01");
    expect(maskDigits(digitar("12"))).toBe("0,12");
    expect(maskDigits(digitar("123"))).toBe("1,23");
    expect(maskDigits(digitar("1234"))).toBe("12,34");
  });

  it("agrupa o milhar a partir do sexto dígito", () => {
    expect(maskDigits(digitar("12345"))).toBe("123,45");
    expect(maskDigits(digitar("123456"))).toBe("1.234,56");
    expect(maskDigits(digitar("123456789"))).toBe("1.234.567,89");
  });

  it("descarta vírgula, ponto, letra e sinal digitados", () => {
    expect(maskDigits(digitar("1a2,3.4-"))).toBe("12,34");
  });
});

describe("apagar", () => {
  it("desloca o número de volta para a direita", () => {
    expect(maskDigits(apagar("123456"))).toBe("123,45");
    expect(maskDigits(apagar("12345"))).toBe("12,34");
  });

  /*
    O caminho que a regra do "0" existe para permitir: sem ela o campo travaria
    em 0,00 e nenhuma tecla seria capaz de limpá-lo.
  */
  it("chega ao campo vazio, e não a um zero preso", () => {
    let digitos = "1234";
    for (let i = 0; i < 10 && digitos !== ""; i++) digitos = apagar(digitos);
    expect(digitos).toBe("");
    expect(maskDigits(digitos)).toBe("");
  });
});

describe("teto de nove dígitos inteiros", () => {
  it("recusa o décimo segundo dígito em vez de truncar o valor", () => {
    const cheio = digitar("99999999999");
    expect(maskDigits(cheio)).toBe("999.999.999,99");
    expect(maskDigits(digitar("999999999991"))).toBe("999.999.999,99");
  });

  it("zeros à esquerda não consomem o teto", () => {
    expect(onlyDigits("0000001")).toBe("1");
    expect(maskDigits(digitar("0000001"))).toBe("0,01");
    expect(onlyDigits("0".repeat(20) + "1".repeat(MAX_DIGITS))).toHaveLength(MAX_DIGITS);
  });
});

describe("colar", () => {
  it("lê os dígitos de um valor já formatado", () => {
    expect(maskDigits(onlyDigits("R$ 1.234,56"))).toBe("1.234,56");
  });
});

describe("conversão para centavos", () => {
  it("devolve o inteiro que vai para o log", () => {
    expect(minorOf("")).toBe(0);
    expect(minorOf("1")).toBe(1);
    expect(minorOf("123456")).toBe(123456);
  });

  it("campo vazio exibe vazio, para o placeholder aparecer", () => {
    expect(maskDigits("")).toBe("");
    expect(onlyDigits("")).toBe("");
    expect(onlyDigits("0")).toBe("");
  });
});
