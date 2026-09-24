import { describe, expect, it } from "vitest";
import {
  COLOR_NAMES,
  COLOR_TOKENS,
  colorName,
  cssVarForToken,
  FALLBACK_TOKEN,
  tileStyle,
} from "./color-token";

describe("cssVarForToken", () => {
  it("resolve token conhecido para a variável CSS", () => {
    expect(cssVarForToken("emerald")).toBe("var(--color-tag-emerald)");
  });

  it("resolve os doze tokens da paleta", () => {
    for (const token of COLOR_TOKENS) {
      expect(cssVarForToken(token)).toBe(`var(--color-tag-${token})`);
    }
  });

  it("cai no neutro para token de uma versão futura", () => {
    // O fold aceitou o valor de propósito — descartar no dominio o apagaria para
    // sempre. O fallback é decisão de renderização, e mora aqui.
    expect(cssVarForToken("chartreuse")).toBe(`var(--color-tag-${FALLBACK_TOKEN})`);
    expect(cssVarForToken("")).toBe(`var(--color-tag-${FALLBACK_TOKEN})`);
  });

  it("não deixa token injetar CSS arbitrário", () => {
    // O valor vem do log, que vem do sync, que vem de outro aparelho. Sem a
    // checagem contra a lista, `red); background: url(...` sairia direto no
    // atributo style.
    expect(cssVarForToken("red); content: 'x'")).toBe(`var(--color-tag-${FALLBACK_TOKEN})`);
  });

  it("declara os doze tokens do roadmap", () => {
    expect(COLOR_TOKENS).toHaveLength(12);
  });
});

describe("colorName", () => {
  it("dá nome em português aos doze tokens, sem repetir", () => {
    const names = COLOR_TOKENS.map((token) => COLOR_NAMES[token]);
    expect(new Set(names).size).toBe(12);
    expect(colorName("sky")).toBe("Céu");
    expect(colorName("red")).toBe("Coral");
  });

  it("token desconhecido lê como o neutro", () => {
    expect(colorName("chartreuse")).toBe("Cinza");
  });
});

describe("tileStyle", () => {
  it("tinge o fundo e pinta o ícone na cor cheia", () => {
    expect(tileStyle("teal")).toEqual({
      backgroundColor: "color-mix(in oklch, var(--color-tag-teal) 18%, transparent)",
      color: "var(--color-tag-teal)",
    });
  });
});
