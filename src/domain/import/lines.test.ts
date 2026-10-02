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

  it("junta a descrição quebrada em linhas acima e abaixo da data (Mercado Pago)", () => {
    const lines = groupLines([
      item("Data", 40, 443),
      item("Descrição", 89, 443),
      item("Pagamento com QR Pix", 89, 558.4),
      item("05-09-2026", 40, 545.6),
      item("FULANA DE TAL", 89, 546.4),
      item("177482308548", 197, 545.6),
      item("R$ -15,00", 301, 545.6),
      item("R$ 703,15", 372, 545.6),
      item("SOBRENOME", 89, 534.4),
      item("Pagamento de assinatura", 89, 516.7),
      item("03-09-2026", 40, 509.9),
      item("3545330270", 197, 509.9),
      item("R$ -0,56", 303, 509.9),
      item("R$ 0,00", 378, 509.9),
      item("Meli+", 89, 504.7),
    ]);
    expect(lines).toEqual([
      "05-09-2026 Pagamento com QR Pix FULANA DE TAL 177482308548 SOBRENOME R$ -15,00 R$ 703,15",
      "03-09-2026 Pagamento de assinatura 3545330270 Meli+ R$ -0,56 R$ 0,00",
      "Data Descrição",
    ]);
  });

  it("não cola na transação o que está longe ou fora da coluna da descrição", () => {
    const lines = groupLines([
      item("Data Descrição", 40, 524),
      item("10/09", 40, 510),
      item("PADARIA", 89, 510),
      item("R$ 9,00", 300, 510),
      item("rodapé distante", 89, 470),
    ]);
    expect(lines).toEqual(["Data Descrição", "10/09 PADARIA R$ 9,00", "rodapé distante"]);
  });
});
