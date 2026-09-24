import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { Icon } from "./icon";
import { ICON_KEYS, PICKABLE_ICONS } from "./icon-set";

afterEach(cleanup);

describe("Icon", () => {
  it("renderiza o ícone pedido", () => {
    render(<Icon name="utensils" />);

    expect(screen.getByTestId("icon-utensils")).toBeDefined();
  });

  it("cai no ícone neutro para chave desconhecida", () => {
    // O log é eterno: um aparelho de versão mais nova pode gravar uma chave que
    // esta versão não conhece. Não renderizar nada deixaria o item sem âncora
    // visual e o usuário sem entender o que sumiu.
    render(<Icon name="chave-de-uma-versao-futura" />);

    expect(screen.getByTestId("icon-fallback")).toBeDefined();
  });

  it("não quebra com chave vazia", () => {
    render(<Icon name="" />);

    expect(screen.getByTestId("icon-fallback")).toBeDefined();
  });

  it("não herda de Object.prototype", () => {
    // `name="constructor"` acharia uma função no protótipo se o lookup fosse
    // `ICON_SET[name]` sem `Object.hasOwn`, e o render explodiria.
    render(<Icon name="constructor" />);

    expect(screen.getByTestId("icon-fallback")).toBeDefined();
  });

  it("é decorativo sem rótulo e acessível com rótulo", () => {
    const { container } = render(<Icon name="tag" />);
    expect(container.querySelector("[aria-hidden=true]")).not.toBeNull();

    cleanup();
    render(<Icon name="tag" label="Categoria" />);
    expect(screen.getByRole("img", { name: "Categoria" })).toBeDefined();
  });

  it("todas as chaves do conjunto renderizam", () => {
    // Um nome Phosphor com typo no mapa só quebraria a tela que usa aquela
    // chave, meses depois. Aqui toda chave precisa achar um glifo gerado.
    for (const key of ICON_KEYS) {
      render(<Icon name={key} />);
      expect(screen.getByTestId(`icon-${key}`)).toBeDefined();
      cleanup();
    }
  });

  it("toda chave do mapa aponta para um glifo com desenho", () => {
    for (const key of ICON_KEYS) {
      const { container } = render(<Icon name={key} />);
      expect(container.querySelector("path")?.getAttribute("d")).toBeTruthy();
      cleanup();
    }
  });

  it("a grade de escolha só oferece chaves conhecidas, sem a seta de interface", () => {
    expect(PICKABLE_ICONS.every((key) => ICON_KEYS.includes(key))).toBe(true);
    expect(PICKABLE_ICONS).not.toContain("chevron-down");
    expect(PICKABLE_ICONS).toContain("paw-print");
    expect(new Set(PICKABLE_ICONS).size).toBe(35);
  });

  it("peso preenchido troca o desenho quando o glifo tem variante", () => {
    const { container } = render(<Icon name="house" />);
    const regular = container.querySelector("path")?.getAttribute("d");
    cleanup();

    const filled = render(<Icon name="house" weight="fill" />).container;
    expect(filled.querySelector("path")?.getAttribute("d")).not.toBe(regular);
  });

  it("aceita nome de interface do Phosphor além das chaves do log", () => {
    render(<Icon name="arrow-right" />);

    expect(screen.getByTestId("icon-arrow-right")).toBeDefined();
  });
});
