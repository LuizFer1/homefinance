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
});

describe("formatBRL", () => {
  it("formata centavos como moeda brasileira", () => {
    expect(normalize(formatBRL(123456))).toBe("R$ 1.234,56");
    expect(normalize(formatBRL(0))).toBe("R$ 0,00");
  });
});
