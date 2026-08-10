import { describe, expect, it } from "vitest";
import { lastMonths, monthLabelLong, monthLabelShort, monthOf } from "./periods";

describe("monthOf", () => {
  it("corta a data no mês", () => {
    expect(monthOf("2026-08-10")).toBe("2026-08");
  });

  it("não desloca o mês no primeiro nem no último dia", () => {
    // Este é o teste que justifica não usar Date: `new Date("2026-08-01")` é
    // lido como UTC e no fuso do Brasil vira 31/07 às 21h, jogando todo dia 1º
    // para o mês anterior.
    expect(monthOf("2026-08-01")).toBe("2026-08");
    expect(monthOf("2026-08-31")).toBe("2026-08");
  });
});

describe("lastMonths", () => {
  it("termina no mês corrente e começa pelo mais antigo", () => {
    expect(lastMonths("2026-08-10", 6)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("atravessa a virada de ano", () => {
    // O decremento ingênuo (mes - 1) quebra aqui: janeiro menos um dá zero, e
    // zero não é mês nenhum.
    expect(lastMonths("2026-01-15", 6)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });

  it("devolve só o mês corrente quando a janela é de um", () => {
    expect(lastMonths("2026-01-15", 1)).toEqual(["2026-01"]);
  });
});

describe("rótulos", () => {
  it("abrevia em três letras", () => {
    expect(monthLabelShort("2026-08")).toBe("ago");
    expect(monthLabelShort("2026-01")).toBe("jan");
    expect(monthLabelShort("2026-12")).toBe("dez");
  });

  it("escreve por extenso com o ano", () => {
    expect(monthLabelLong("2026-08")).toBe("agosto de 2026");
    expect(monthLabelLong("2025-03")).toBe("março de 2025");
  });
});
