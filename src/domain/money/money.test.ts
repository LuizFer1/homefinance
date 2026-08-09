import { describe, expect, it } from "vitest";
import { formatBRL, parseBRL } from "./money";

/** Intl usa espaço não-quebrável entre símbolo e número. */
function normalize(value: string): string {
  return value.replace(/\u00a0/g, " ");
}

describe("parseBRL", () => {
  it("aceita vírgula como separador decimal", () => {
    expect(parseBRL("12,34")).toBe(1234);
  });

  it("aceita ponto como separador decimal", () => {
    expect(parseBRL("12.34")).toBe(1234);
  });

  it("aceita ponto de milhar com vírgula decimal", () => {
    expect(parseBRL("1.234,56")).toBe(123456);
  });

  it("trata ponto único com três dígitos como separador de milhar", () => {
    expect(parseBRL("1.234")).toBe(123400);
  });

  it("aceita valor sem separador", () => {
    expect(parseBRL("1234")).toBe(123400);
  });

  it("ignora o símbolo da moeda e espaços", () => {
    expect(parseBRL("R$ 12,34")).toBe(1234);
  });

  it("completa casas decimais faltantes", () => {
    expect(parseBRL("0,5")).toBe(50);
  });

  it("arredonda meio para cima acima de duas casas", () => {
    expect(parseBRL("12,345")).toBe(1235);
    expect(parseBRL("12,344")).toBe(1234);
  });

  it("rejeita entrada vazia, inválida ou negativa", () => {
    expect(parseBRL("")).toBeNull();
    expect(parseBRL("   ")).toBeNull();
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("-5")).toBeNull();
  });

  it("aceita o formato en-US com vírgula de milhar", () => {
    expect(parseBRL("1,234.56")).toBe(123456);
  });

  it("distingue decimal de milhar pela regra do zero inicial", () => {
    expect(parseBRL("0.500")).toBe(50);
    expect(parseBRL("10.500")).toBe(1050000);
  });

  it("propaga o arredondamento para a casa dos reais", () => {
    expect(parseBRL("9,995")).toBe(1000);
    expect(parseBRL("0,999")).toBe(100);
  });

  it("rejeita sinal negativo em qualquer notação", () => {
    expect(parseBRL("-12,34")).toBeNull();
    expect(parseBRL("\u221212,34")).toBeNull();
    expect(parseBRL("(12,34)")).toBeNull();
  });

  it("rejeita agrupamento de milhar malformado", () => {
    expect(parseBRL("1.23.456")).toBeNull();
    expect(parseBRL("1,2,3")).toBeNull();
    expect(parseBRL("1.2.3")).toBeNull();
  });

  it("aceita valor sem parte inteira", () => {
    expect(parseBRL(",50")).toBe(50);
    expect(parseBRL(".50")).toBe(50);
  });
});

describe("formatBRL", () => {
  it("formata centavos como moeda brasileira", () => {
    expect(normalize(formatBRL(123456))).toBe("R$ 1.234,56");
    expect(normalize(formatBRL(0))).toBe("R$ 0,00");
  });
});
