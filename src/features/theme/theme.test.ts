import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPreference,
  DATA_THEME,
  readPreference,
  resolveTheme,
  syncThemeColor,
  THEME_KEY,
  type ThemePreference,
  writePreference,
} from "./theme";

function fakeStorage(initial?: Record<string, string>) {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("readPreference", () => {
  it("cai em 'system' quando nada foi gravado", () => {
    expect(readPreference(fakeStorage())).toBe("system");
  });

  it("lê as preferências explícitas", () => {
    expect(readPreference(fakeStorage({ [THEME_KEY]: "light" }))).toBe("light");
    expect(readPreference(fakeStorage({ [THEME_KEY]: "dark" }))).toBe("dark");
  });

  // O valor vem de um storage que qualquer coisa pode ter escrito; um valor
  // desconhecido não pode deixar o app sem tema nenhum.
  it("cai em 'system' quando o valor gravado não é reconhecido", () => {
    expect(readPreference(fakeStorage({ [THEME_KEY]: "roxo" }))).toBe("system");
  });

  // Modo privado e quota estourada fazem o getItem lançar, e o tema é a
  // última coisa que pode derrubar o app.
  it("cai em 'system' quando o storage lança", () => {
    const explosivo = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
    };
    expect(readPreference(explosivo)).toBe("system");
  });
});

describe("writePreference", () => {
  it("grava a preferência escolhida", () => {
    const storage = fakeStorage();
    writePreference(storage, "dark");
    expect(storage.map.get(THEME_KEY)).toBe("dark");
  });

  it("não lança quando o storage recusa a escrita", () => {
    const explosivo = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => writePreference(explosivo, "light")).not.toThrow();
  });
});

describe("applyPreference", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("html");
  });

  it("marca o atributo do tema escolhido", () => {
    applyPreference(root, "light");
    expect(root.getAttribute(DATA_THEME)).toBe("hf-light");

    applyPreference(root, "dark");
    expect(root.getAttribute(DATA_THEME)).toBe("hf-dark");
  });

  /*
   * 'system' precisa *remover* o atributo, não escrever um tema fixo: é a
   * ausência dele que devolve a decisão para o `prefers-color-scheme` e faz o
   * app acompanhar o sistema quando ele muda ao longo do dia.
   */
  it("remove o atributo em 'system' para devolver a decisão ao sistema", () => {
    applyPreference(root, "dark");
    applyPreference(root, "system");
    expect(root.hasAttribute(DATA_THEME)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("respeita a escolha explícita, contrariando o sistema", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("segue o sistema em 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("contrato de tipos", () => {
  it("cobre as três preferências", () => {
    const todas: ThemePreference[] = ["system", "light", "dark"];
    expect(new Set(todas).size).toBe(3);
  });
});

describe("syncThemeColor", () => {
  function docComMetas(): Document {
    const doc = document.implementation.createHTMLDocument("teste");
    doc.head.innerHTML =
      '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f3f3" />' +
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0c0e" />';
    return doc;
  }

  const override = (doc: Document) => doc.head.querySelector("meta[name=theme-color]:not([media])");

  /*
   * A barra do navegador na PWA fica visível o tempo todo. Sem isto, escolher
   * o claro num sistema escuro deixa a barra preta em cima de um app branco.
   */
  it("instala uma meta sem media, que vence as duas com media", () => {
    const doc = docComMetas();
    syncThemeColor(doc, "light");

    const meta = override(doc);
    expect(meta?.getAttribute("content")).toBe("#f3f3f3");
    // Vence por vir antes: o navegador usa a primeira meta cuja media casa.
    expect(doc.head.firstElementChild).toBe(meta);
  });

  it("troca o conteúdo em vez de acumular metas", () => {
    const doc = docComMetas();
    syncThemeColor(doc, "light");
    syncThemeColor(doc, "dark");

    expect(doc.head.querySelectorAll("meta[name=theme-color]:not([media])").length).toBe(1);
    expect(override(doc)?.getAttribute("content")).toBe("#0b0c0e");
  });

  // Em 'system' as duas metas com media já fazem a coisa certa sozinhas.
  it("remove o override em 'system' e devolve as metas com media", () => {
    const doc = docComMetas();
    syncThemeColor(doc, "dark");
    syncThemeColor(doc, null);

    expect(override(doc)).toBeNull();
    expect(doc.head.querySelectorAll("meta[name=theme-color][media]").length).toBe(2);
  });

  it("não lança se o documento não declarar as metas com media", () => {
    const doc = document.implementation.createHTMLDocument("vazio");
    expect(() => syncThemeColor(doc, "dark")).not.toThrow();
    expect(override(doc)).toBeNull();
  });
});

/*
 * O script pré-paint do index.html repete a chave e o prefixo do tema porque
 * não pode importar módulo. Estes testes são o que impede os dois de divergirem
 * em silêncio — a divergência não quebra nada, só faz a preferência ser
 * ignorada no carregamento, que é o bug mais difícil de notar.
 */
describe("script pré-paint do index.html", () => {
  const html = readFileSync(path.join(process.cwd(), "app", "index.html"), "utf8");

  it("usa a mesma chave de storage do módulo", () => {
    expect(html).toContain(`localStorage.getItem("${THEME_KEY}")`);
  });

  it("monta os mesmos nomes de tema que applyPreference", () => {
    // O prefixo sai do próprio módulo, então renomear "hf-" quebra este teste.
    const root = document.createElement("html");
    applyPreference(root, "light");
    const nome = root.getAttribute(DATA_THEME) ?? "";
    const prefixo = nome.slice(0, nome.indexOf("light"));

    expect(prefixo).not.toBe("");
    // biome-ignore lint/style/useTemplate: a string procurada e literal dentro do HTML
    // biome-ignore lint/suspicious/noTemplateCurlyInString: e exatamente o texto que se espera achar
    expect(html).toContain("`" + prefixo + "${pref}`");
  });

  it("declara o atributo que applyPreference escreve", () => {
    expect(html).toContain(`setAttribute("${DATA_THEME}"`);
  });

  // Sem o try/catch, uma aba privada derruba o app antes do primeiro render.
  it("protege o acesso ao localStorage", () => {
    expect(html).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/);
  });
});
