import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { BrandMark } from "./brand-mark";

afterEach(cleanup);

describe("BrandMark", () => {
  it("desenha a marca em vetor, na cor do texto", () => {
    // Traço em currentColor é o que a mantém visível no escuro — o PNG preto
    // sumia no fundo do Nocturne.
    const { container } = render(<BrandMark size={44} />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("brand-mark").style.width).toBe("44px");
  });

  it("e decorativa: fora da árvore de acessibilidade", () => {
    render(<BrandMark />);

    expect(screen.getByTestId("brand-mark").getAttribute("aria-hidden")).toBe("true");
  });
});
