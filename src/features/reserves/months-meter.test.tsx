import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { MonthsMeter } from "./months-meter";

afterEach(cleanup);

describe("MonthsMeter", () => {
  it("seis segmentos; o quarto 90% cheio em 3,9 meses", () => {
    const { container } = render(<MonthsMeter months={3.9} height={8} />);
    const fills = container.querySelectorAll<HTMLElement>("[data-fill]");
    expect(fills).toHaveLength(6);
    expect(fills[3]?.style.width).toBe("90%");
    expect(fills[4]?.style.width).toBe("0%");
  });

  it("parte removida desenhada na cor de despesa", () => {
    const { container } = render(<MonthsMeter months={3.8} removedMonths={0.1} height={8} />);
    expect(container.querySelectorAll("[data-removed]").length).toBeGreaterThan(0);
  });

  it("sem retirada não desenha parte removida", () => {
    const { container } = render(<MonthsMeter months={3.8} height={8} />);
    expect(container.querySelectorAll("[data-removed]")).toHaveLength(0);
  });

  it("tracejado (estado vazio): seis segmentos de 14px sem preenchimento", () => {
    const { container } = render(<MonthsMeter months={0} height={14} dashed />);
    expect(container.querySelectorAll("[data-fill]")).toHaveLength(0);
    const segments = container.querySelectorAll<HTMLElement>("[data-segment]");
    expect(segments).toHaveLength(6);
    expect(segments[0]?.style.height).toBe("14px");
  });

  it("segmentos ficam fora da árvore de acessibilidade", () => {
    const { container } = render(<MonthsMeter months={2} height={10} />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});
