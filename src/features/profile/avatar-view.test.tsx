import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar, initialsFor, isDisplayableAvatar } from "./avatar-view";

afterEach(cleanup);

describe("initialsFor", () => {
  it("usa a primeira letra do primeiro e do ultimo nome", () => {
    expect(initialsFor("Luiz Fernando")).toBe("LF");
  });

  it("ignora os nomes do meio", () => {
    expect(initialsFor("Luiz Fernando da Silva")).toBe("LS");
  });

  it("usa uma letra so quando o nome tem uma palavra", () => {
    expect(initialsFor("Luiz")).toBe("L");
  });

  it("ignora espacos sobrando", () => {
    expect(initialsFor("  Luiz   Fernando  ")).toBe("LF");
  });

  it("cai num neutro quando o nome esta vazio", () => {
    expect(initialsFor("   ")).toBe("?");
    expect(initialsFor("")).toBe("?");
  });
});

describe("isDisplayableAvatar", () => {
  it("aceita os tres formatos rasterizados", () => {
    expect(isDisplayableAvatar("data:image/webp;base64,AAAA")).toBe(true);
    expect(isDisplayableAvatar("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(isDisplayableAvatar("data:image/png;base64,AAAA")).toBe(true);
  });

  it("recusa svg, que carrega script", () => {
    // A string vem do banco, e a linha vem do aparelho da outra pessoa via sync:
    // e entrada nao confiavel. Num <img> o script do SVG nao executa, entao
    // isto nao corrige um furo conhecido — recusa um formato que carrega script
    // quando tres formatos rasterizados ja resolvem o caso inteiro.
    expect(isDisplayableAvatar("data:image/svg+xml;base64,AAAA")).toBe(false);
  });

  it("recusa url remota, esquema perigoso e lixo", () => {
    // Nenhuma requisicao de rede sai deste app: uma url remota no avatar seria
    // a primeira, e chegaria pelo sync de outro aparelho.
    expect(isDisplayableAvatar("https://exemplo.com/foto.png")).toBe(false);
    expect(isDisplayableAvatar("javascript:alert(1)")).toBe(false);
    expect(isDisplayableAvatar("data:text/html;base64,AAAA")).toBe(false);
    expect(isDisplayableAvatar("")).toBe(false);
    expect(isDisplayableAvatar(null)).toBe(false);
  });
});

describe("Avatar", () => {
  it("renderiza a foto quando ela e exibivel", () => {
    render(<Avatar name="Luiz" color="teal" avatar="data:image/webp;base64,AAAA" />);

    expect(screen.getByRole("img").getAttribute("src")).toBe("data:image/webp;base64,AAAA");
  });

  it("cai nas iniciais quando nao ha foto", () => {
    render(<Avatar name="Luiz Fernando" color="teal" avatar={null} />);

    expect(screen.getByText("LF")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("cai nas iniciais quando o formato nao esta na lista de permissao", () => {
    render(<Avatar name="Luiz" color="teal" avatar="data:image/svg+xml;base64,AAAA" />);

    expect(screen.getByText("L")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("resolve token de cor desconhecido para o neutro, sem sumir da tela", () => {
    render(<Avatar name="Luiz" color="chartreuse" avatar={null} />);

    expect(screen.getByText("L").getAttribute("style")).toContain("--color-tag-slate");
  });
});
