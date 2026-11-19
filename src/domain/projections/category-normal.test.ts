import { describe, expect, it } from "vitest";
import { tx } from "../reserves/fixtures.fake";
import { categoriesAboveNormal } from "./category-normal";
import { CAT, GRAFITE_TODAY, grafiteState } from "./grafite.fake";
import { listTransactions } from "./selectors";

const STATE = grafiteState();

function aboveOf(items: ReturnType<typeof listTransactions>, month: string, today: string) {
  return categoriesAboveNormal(items, STATE, month, today);
}

describe("categoriesAboveNormal: fixture grafite", () => {
  const above = categoriesAboveNormal(listTransactions(STATE), STATE, "2026-11", GRAFITE_TODAY);

  it("Compras: 51515 contra 37330 de outubro até o dia 19 → ↑ 38% do normal", () => {
    expect(above.get(CAT.compras)).toEqual({
      spentMinor: 51_515,
      normalMinor: 37_330,
      changePercent: 38,
    });
  });

  it("só Compras é marcada (normal zero não marca; Mercado está abaixo)", () => {
    expect([...above.keys()]).toEqual([CAT.compras]);
  });

  it("em outubro (primeiro mês) não há referência: nada é marcado", () => {
    expect(
      categoriesAboveNormal(listTransactions(STATE), STATE, "2026-10", GRAFITE_TODAY).size,
    ).toBe(0);
  });
});

describe("categoriesAboveNormal", () => {
  const ref = (amountMinor: number) => tx("ref", "expense", amountMinor, "2026-07-05", CAT.mercado);
  const now = (amountMinor: number) => tx("now", "expense", amountMinor, "2026-08-05", CAT.mercado);

  it("+25% e R$ 50: os dois limites exatos marcam", () => {
    const above = aboveOf([now(25_000), ref(20_000)], "2026-08", "2026-08-20");
    expect(above.get(CAT.mercado)?.changePercent).toBe(25);
  });

  it("+40% mas só R$ 40 a mais não marca (R$ 8 → R$ 12 não é alarme)", () => {
    expect(aboveOf([now(14_000), ref(10_000)], "2026-08", "2026-08-20").size).toBe(0);
  });

  it("R$ 200 a mais mas só +20% não marca", () => {
    expect(aboveOf([now(120_000), ref(100_000)], "2026-08", "2026-08-20").size).toBe(0);
  });

  it("mês corrente compara até o mesmo dia: o gasto depois de hoje não pesa", () => {
    const items = [
      now(10_000),
      tx("later", "expense", 90_000, "2026-08-25", CAT.mercado),
      ref(10_000),
    ];
    expect(aboveOf(items, "2026-08", "2026-08-20").size).toBe(0);
  });

  it("mês corrente: o normal também é só até o mesmo dia", () => {
    const items = [
      now(20_000),
      ref(10_000),
      tx("ref2", "expense", 50_000, "2026-07-25", CAT.mercado),
    ];
    expect(aboveOf(items, "2026-08", "2026-08-20").get(CAT.mercado)?.normalMinor).toBe(10_000);
  });

  it("mês fechado compara o mês inteiro com o mês inteiro", () => {
    const items = [
      now(10_000),
      tx("late", "expense", 15_000, "2026-08-28", CAT.mercado),
      ref(10_000),
    ];
    const above = aboveOf(items, "2026-08", "2026-09-10");
    expect(above.get(CAT.mercado)).toEqual({
      spentMinor: 25_000,
      normalMinor: 10_000,
      changePercent: 150,
    });
  });

  it("divide pelos meses de referência com dado, inclusive o vazio depois do primeiro", () => {
    // Junho tem 30000, julho nada: normal = 15000 (dois meses, o primeiro é junho).
    const items = [now(30_000), tx("jun", "expense", 30_000, "2026-06-05", CAT.mercado)];
    const above = aboveOf(items, "2026-08", "2026-08-20");
    expect(above.get(CAT.mercado)?.normalMinor).toBe(15_000);
    expect(above.get(CAT.mercado)?.changePercent).toBe(100);
  });

  it("transferência e oculto não contam", () => {
    const items = [
      now(10_000),
      tx("t", "expense", 90_000, "2026-08-06", CAT.mercado, { reportState: "transfer" }),
      ref(10_000),
    ];
    expect(aboveOf(items, "2026-08", "2026-08-20").size).toBe(0);
  });
});
