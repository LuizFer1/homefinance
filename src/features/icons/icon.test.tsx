import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { Icon } from "./icon";
import { ICON_KEYS } from "./icon-set";

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
    // 34 imports literais é onde um typo se esconde: o import vira `undefined` e
    // só a tela que usa aquela chave quebra, meses depois.
    for (const key of ICON_KEYS) {
      render(<Icon name={key} />);
      expect(screen.getByTestId(`icon-${key}`)).toBeDefined();
      cleanup();
    }
  });
});
