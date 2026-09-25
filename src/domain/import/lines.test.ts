import { describe, expect, it } from "vitest";
import { groupLines, type TextItem } from "./lines";

function item(str: string, x: number, y: number, page = 1, width = str.length * 5): TextItem {
  return { str, x, y, width, page };
}

describe("groupLines", () => {
  it("junta colunas com o mesmo y e ordena por x", () => {
    const lines = groupLines([
      item("R$ 45,90", 400, 700),
      item("12/09", 20, 700),
      item("IFOOD *RESTAURANTE", 80, 701.5),
    ]);
    expect(lines).toEqual(["12/09 IFOOD *RESTAURANTE R$ 45,90"]);
  });

  it("ordena as linhas de cima para baixo e por página", () => {
    const lines = groupLines([
      item("segunda", 20, 500, 1),
      item("outra página", 20, 800, 2),
      item("primeira", 20, 700, 1),
    ]);
    expect(lines).toEqual(["primeira", "segunda", "outra página"]);
  });

  it("não põe espaço dentro de um token partido pelo gerador", () => {
    const lines = groupLines([item("1.2", 100, 700, 1, 15), item("34,56", 115, 700, 1, 25)]);
    expect(lines).toEqual(["1.234,56"]);
  });

  it("descarta pedaços em branco", () => {
    expect(groupLines([item("  ", 10, 10), item("a", 20, 10)])).toEqual(["a"]);
  });
});
