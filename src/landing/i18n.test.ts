import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyLang, isMessageKey, messages, pickLang } from "./i18n";

const html = readFileSync(path.join(process.cwd(), "index.html"), "utf8");

function landingDocument(): Document {
  const doc = document.implementation.createHTMLDocument("");
  doc.documentElement.innerHTML = html.replace(/^<!doctype html>/i, "");
  return doc;
}

describe("dicionarios", () => {
  it("en e pt tem exatamente as mesmas chaves", () => {
    expect(Object.keys(messages.pt).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it("nenhuma traducao ficou vazia", () => {
    for (const lang of ["en", "pt"] as const) {
      for (const [key, text] of Object.entries(messages[lang])) {
        expect(text.trim(), `${lang}:${key}`).not.toBe("");
      }
    }
  });
});

/*
 * O HTML sai em ingles (e o que buscador, previa de link e navegador sem JS
 * leem) e o dicionario `en` e o que volta o texto quando a pessoa troca de PT
 * para EN. Se os dois divergirem, a pagina muda de texto sozinha no primeiro
 * clique no seletor — estes testes sao o que impede isso.
 */
describe("index.html", () => {
  const doc = landingDocument();

  it("toda chave usada no HTML existe no dicionario", () => {
    const keys = [...doc.querySelectorAll("[data-i18n],[data-i18n-label],[data-i18n-alt]")].flatMap(
      (el) =>
        ["data-i18n", "data-i18n-label", "data-i18n-alt"]
          .map((attr) => el.getAttribute(attr))
          .filter((k): k is string => k !== null),
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => !isMessageKey(k))).toEqual([]);
  });

  it("o texto em ingles do HTML e o mesmo do dicionario", () => {
    for (const el of doc.querySelectorAll("[data-i18n]")) {
      const key = el.getAttribute("data-i18n") ?? "";
      if (!isMessageKey(key)) continue;
      expect(el.textContent?.replace(/\s+/g, " ").trim(), key).toBe(messages.en[key]);
    }
  });

  it("aria-label e alt em ingles batem com o dicionario", () => {
    for (const el of doc.querySelectorAll("[data-i18n-label]")) {
      const key = el.getAttribute("data-i18n-label") ?? "";
      if (isMessageKey(key)) expect(el.getAttribute("aria-label"), key).toBe(messages.en[key]);
    }
    for (const el of doc.querySelectorAll("[data-i18n-alt]")) {
      const key = el.getAttribute("data-i18n-alt") ?? "";
      if (isMessageKey(key)) expect(el.getAttribute("alt"), key).toBe(messages.en[key]);
    }
  });

  it("todas as chaves do dicionario aparecem na pagina", () => {
    const used = new Set(
      [...doc.querySelectorAll("*")].flatMap((el) =>
        ["data-i18n", "data-i18n-label", "data-i18n-alt"]
          .map((attr) => el.getAttribute(attr))
          .filter((k): k is string => k !== null),
      ),
    );
    // Chave orfa e texto que ninguem revisa: traduzido, mas nunca exibido.
    const missing = Object.keys(messages.en).filter((k) => !used.has(k));
    expect(missing).toEqual([]);
  });
});

describe("pickLang", () => {
  it("a escolha salva vence o navegador", () => {
    expect(pickLang("en", "pt-BR")).toBe("en");
    expect(pickLang("pt", "en-US")).toBe("pt");
  });

  it("sem escolha, navegador em portugues abre em portugues", () => {
    expect(pickLang(null, "pt-BR")).toBe("pt");
    expect(pickLang(null, "pt-PT")).toBe("pt");
  });

  it("qualquer outro idioma, ou valor salvo corrompido, cai no ingles", () => {
    expect(pickLang(null, "es-ES")).toBe("en");
    expect(pickLang(null, undefined)).toBe("en");
    expect(pickLang("fr", "de-DE")).toBe("en");
  });
});

describe("applyLang", () => {
  it("troca textos, aria-label, alt e o lang do documento", () => {
    const doc = landingDocument();
    // Seletor que nao acha nada faria o `?.` devolver undefined e a assercao
    // passar comparando undefined com undefined: o elemento tem que existir.
    const el = (selector: string) => {
      const found = doc.querySelector(selector);
      expect(found, selector).not.toBeNull();
      return found;
    };
    applyLang(doc, "pt");

    expect(doc.documentElement.lang).toBe("pt-BR");
    expect(el('[data-i18n="cta.install"]')?.textContent).toBe("Instalar app");
    expect(el('[data-i18n-label="sheet.close"]')?.getAttribute("aria-label")).toBe("Fechar");
    expect(el('[data-i18n-alt="qr.alt"]')?.getAttribute("alt")).toBe(messages.pt["qr.alt"]);

    applyLang(doc, "en");
    expect(doc.documentElement.lang).toBe("en");
    expect(el('[data-i18n="cta.install"]')?.textContent).toBe("Install app");
  });
});
