import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, cssVarForToken, FALLBACK_TOKEN } from "./color-token";

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
