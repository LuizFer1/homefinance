import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { DATA_THEME, THEME_KEY } from "./theme";
import { ThemeToggle } from "./theme-toggle";

afterEach(cleanup);

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

/** Documento separado do que o testing-library renderiza, para observar só os efeitos. */
function fakeDoc(): Document {
  const doc = document.implementation.createHTMLDocument("teste");
  doc.head.innerHTML =
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f3f3" />' +
    '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0c0e" />';
  return doc;
}

describe("ThemeToggle", () => {
  it("oferece as três opções com nome acessível", () => {
    render(<ThemeToggle storage={fakeStorage()} doc={fakeDoc()} />);

    expect(screen.getByRole("radio", { name: "Claro" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Escuro" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Sistema" })).toBeDefined();
  });

  it("começa em 'Sistema' quando nada foi escolhido antes", () => {
    render(<ThemeToggle storage={fakeStorage()} doc={fakeDoc()} />);

    expect((screen.getByRole("radio", { name: "Sistema" }) as HTMLInputElement).checked).toBe(true);
  });

  it("começa na preferência já gravada", () => {
    render(<ThemeToggle storage={fakeStorage({ [THEME_KEY]: "dark" })} doc={fakeDoc()} />);

    expect((screen.getByRole("radio", { name: "Escuro" }) as HTMLInputElement).checked).toBe(true);
  });

  it("aplica o tema no documento e persiste a escolha", () => {
    const storage = fakeStorage();
    const doc = fakeDoc();
    render(<ThemeToggle storage={storage} doc={doc} />);

    fireEvent.click(screen.getByRole("radio", { name: "Escuro" }));

    expect(doc.documentElement.getAttribute(DATA_THEME)).toBe("hf-dark");
    expect(storage.map.get(THEME_KEY)).toBe("dark");
  });

  it("acerta a cor da barra do navegador junto com o tema", () => {
    const doc = fakeDoc();
    render(<ThemeToggle storage={fakeStorage()} doc={doc} />);

    fireEvent.click(screen.getByRole("radio", { name: "Claro" }));

    const meta = doc.head.querySelector("meta[name=theme-color]:not([media])");
    expect(meta?.getAttribute("content")).toBe("#f3f3f3");
  });

  it("volta a seguir o sistema, sem deixar tema nem cor fixados", () => {
    const doc = fakeDoc();
    render(<ThemeToggle storage={fakeStorage({ [THEME_KEY]: "light" })} doc={doc} />);

    fireEvent.click(screen.getByRole("radio", { name: "Sistema" }));

    expect(doc.documentElement.hasAttribute(DATA_THEME)).toBe(false);
    expect(doc.head.querySelector("meta[name=theme-color]:not([media])")).toBeNull();
  });
});
