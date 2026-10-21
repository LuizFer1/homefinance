import { describe, expect, it } from "vitest";
import { DELETED_AT } from "../model/row.fake";
import {
  cardCycleText,
  cardDetail,
  isCompleteCard,
  isIncompleteCard,
  isValidCardDay,
  listCreditCards,
} from "./card";
import { card, legacyCard, world } from "./fixtures.fake";

describe("isValidCardDay", () => {
  it("aceita inteiros de 1 a 31", () => {
    for (const day of [1, 15, 28, 31]) expect(isValidCardDay(day)).toBe(true);
  });

  it("recusa zero, 32, decimal, texto e nulo", () => {
    for (const day of [0, 32, -1, 5.5, "5", null, undefined, Number.NaN]) {
      expect(isValidCardDay(day)).toBe(false);
    }
  });
});

describe("cartão completo e por completar", () => {
  it("crédito com banco e os dois dias é completo", () => {
    expect(isCompleteCard(card("nu"))).toBe(true);
    expect(isIncompleteCard(card("nu"))).toBe(false);
  });

  it("crédito sem algum dos três é por completar", () => {
    expect(isIncompleteCard(legacyCard("velho"))).toBe(true);
    expect(isIncompleteCard(card("a", { bank: "  " }))).toBe(true);
    expect(isIncompleteCard(card("b", { closingDay: null }))).toBe(true);
    expect(isIncompleteCard(card("c", { dueDay: 99 }))).toBe(true);
  });

  it("outros tipos nunca são cartão por completar", () => {
    const pix = card("pix", { kind: "pix", bank: null, closingDay: null, dueDay: null });
    expect(isIncompleteCard(pix)).toBe(false);
    expect(isCompleteCard(pix)).toBe(false);
  });
});

describe("listCreditCards", () => {
  it("só crédito vivo, completos primeiro e depois por nome", () => {
    const state = world({
      methods: [
        legacyCard("zz", { name: "Antigo" }),
        card("b", { name: "Inter" }),
        card("a", { name: "Nubank" }),
        card("pix", { kind: "pix" }),
        card("morto", { deletedAt: DELETED_AT }),
      ],
    });

    expect(listCreditCards(state).map((m) => m.id)).toEqual(["b", "a", "zz"]);
  });
});

describe("textos do cartão", () => {
  it("ciclo e detalhe", () => {
    const nu = card("nu", { name: "Roxinho", bank: "Nubank" });
    expect(cardCycleText(nu)).toBe("Fecha dia 5 · vence dia 12");
    expect(cardDetail(nu)).toBe("Nubank · Fecha dia 5 · vence dia 12");
    // Nome igual ao banco não repete.
    expect(cardDetail(card("nu", { name: "Nubank", bank: "Nubank" }))).toBe(
      "Fecha dia 5 · vence dia 12",
    );
  });

  it("cartão por completar avisa; outro tipo não tem detalhe", () => {
    expect(cardDetail(legacyCard("velho"))).toBe("Sem dados do cartão");
    expect(cardCycleText(legacyCard("velho"))).toBeNull();
    expect(cardDetail(card("pix", { kind: "pix" }))).toBeNull();
  });
});
