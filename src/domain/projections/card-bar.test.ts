import { describe, expect, it } from "vitest";
import { card, legacyCard, purchase, world } from "../cards/fixtures.fake";
import { DELETED_AT } from "../model/row.fake";
import { cardSpend, MAX_CARD_SEGMENTS, OTHER_CARDS_NAME, REMOVED_CARD_NAME } from "./card-bar";
import { listTransactions, totals } from "./selectors";

const DAY = "2026-10-10";

function spendOf(state: ReturnType<typeof world>) {
  return cardSpend(listTransactions(state), state);
}

describe("cardSpend", () => {
  it("sem gasto em cartão, não há segmento (a barra fica como era)", () => {
    const state = world({
      methods: [card("nu"), card("pix", { kind: "pix" })],
      transactions: [purchase("a", "pix", DAY), purchase("b", null, DAY)],
    });
    expect(spendOf(state)).toEqual({ segments: [], cardMinor: 0 });
  });

  it("soma a despesa por cartão, na cor de cada um, do maior para o menor", () => {
    const state = world({
      methods: [
        card("nu", { name: "Nubank", color: "violet" }),
        card("itau", { name: "Itaú", color: "orange" }),
      ],
      transactions: [
        purchase("a", "nu", DAY, 1_000),
        purchase("b", "nu", DAY, 2_000),
        purchase("c", "itau", DAY, 5_000),
      ],
    });

    const { segments, cardMinor } = spendOf(state);

    expect(segments.map((s) => [s.name, s.color, s.minor])).toEqual([
      ["Itaú", "orange", 5_000],
      ["Nubank", "violet", 3_000],
    ]);
    expect(cardMinor).toBe(8_000);
  });

  it("o gasto de cartão é parte da despesa que o total já conta, não soma por fora", () => {
    const state = world({
      methods: [card("nu")],
      transactions: [purchase("a", "nu", DAY, 4_000), purchase("b", null, DAY, 1_000)],
    });

    const expense = totals(listTransactions(state)).expenseMinor;
    const { cardMinor } = spendOf(state);

    expect(expense).toBe(5_000);
    expect(cardMinor).toBe(4_000);
    expect(cardMinor).toBeLessThanOrEqual(expense);
  });

  it("transferência e oculto ficam de fora, como em totals", () => {
    const state = world({
      methods: [card("nu")],
      transactions: [
        purchase("a", "nu", DAY, 1_000),
        purchase("t", "nu", DAY, 9_000, { reportState: "transfer" }),
        purchase("h", "nu", DAY, 9_000, { reportState: "hidden" }),
      ],
    });
    expect(spendOf(state).cardMinor).toBe(1_000);
  });

  it("receita no cartão (estorno) não entra: a barra mostra só despesa", () => {
    const state = world({
      methods: [card("nu")],
      transactions: [
        purchase("a", "nu", DAY, 1_000),
        purchase("e", "nu", DAY, 700, { kind: "income" }),
      ],
    });
    expect(spendOf(state).cardMinor).toBe(1_000);
  });

  it("cartão apagado vira um segmento neutro, sem quebrar", () => {
    const state = world({
      methods: [card("velho", { name: "Velho", color: "rose", deletedAt: DELETED_AT })],
      transactions: [purchase("a", "velho", DAY, 1_500)],
    });

    const { segments } = spendOf(state);

    expect(segments).toEqual([
      { key: "removed", cardId: null, name: REMOVED_CARD_NAME, color: "slate", minor: 1_500 },
    ]);
  });

  it("id desconhecido (nem sabemos se era cartão) fica de fora", () => {
    const state = world({ transactions: [purchase("a", "fantasma", DAY, 1_500)] });
    expect(spendOf(state).segments).toEqual([]);
  });

  it("token de cor desconhecido segue no segmento; o desenho degrada para o neutro", () => {
    const state = world({
      methods: [card("nu", { color: "chartreuse" as never })],
      transactions: [purchase("a", "nu", DAY)],
    });
    expect(spendOf(state).segments[0]?.color).toBe("chartreuse");
  });

  it("cartão por completar também aparece, na cor dele", () => {
    const state = world({
      methods: [legacyCard("g", { name: "Cartão de crédito", color: "violet" })],
      transactions: [purchase("a", "g", DAY)],
    });
    expect(spendOf(state).segments[0]).toMatchObject({
      name: "Cartão de crédito",
      color: "violet",
    });
  });

  it("com cinco cartões, mostra os cinco", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const state = world({
      methods: ids.map((id) => card(id, { name: id.toUpperCase(), color: "sky" })),
      transactions: ids.map((id, i) => purchase(`t${id}`, id, DAY, 1_000 * (i + 1))),
    });

    const { segments, cardMinor } = spendOf(state);

    expect(segments).toHaveLength(MAX_CARD_SEGMENTS);
    expect(segments.map((s) => s.name)).toEqual(["E", "D", "C", "B", "A"]);
    expect(cardMinor).toBe(15_000);
  });

  it("passou do limite, os menores se juntam em 'Outros cartões' sem perder valor", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const state = world({
      methods: ids.map((id) => card(id, { name: id.toUpperCase() })),
      transactions: ids.map((id, i) => purchase(`t${id}`, id, DAY, 1_000 * (i + 1))),
    });

    const { segments, cardMinor } = spendOf(state);

    expect(segments).toHaveLength(MAX_CARD_SEGMENTS);
    expect(segments.at(-1)).toMatchObject({ name: OTHER_CARDS_NAME, color: "slate" });
    expect(segments.reduce((sum, s) => sum + s.minor, 0)).toBe(cardMinor);
    expect(cardMinor).toBe(28_000);
  });

  it("é determinística em empate de valor", () => {
    const state = world({
      methods: [card("b"), card("a")],
      transactions: [purchase("x", "a", DAY, 1_000), purchase("y", "b", DAY, 1_000)],
    });
    expect(spendOf(state).segments.map((s) => s.key)).toEqual(["a", "b"]);
  });
});
