import { describe, expect, it } from "vitest";
import { GENESIS_HLC, LEGACY_CREDIT_METHOD_ID } from "../defaults/defaults";
import { DELETED_AT } from "../model/row.fake";
import { card, legacyCard, purchase, series, world } from "./fixtures.fake";
import { listPickableMethods, pendingCardGroups, unusedGenericCard } from "./migration";

describe("pendingCardGroups", () => {
  it("é vazio quando todo cartão tem os dados", () => {
    const state = world({
      methods: [card("nu")],
      transactions: [purchase("a", "nu", "2026-10-02")],
    });
    expect(pendingCardGroups(state)).toEqual([]);
  });

  it("agrupa por método de origem, os maiores primeiro", () => {
    const state = world({
      methods: [legacyCard("generico"), legacyCard("velho"), card("nu")],
      transactions: [
        purchase("a", "generico", "2026-10-02", 1_000),
        purchase("b", "generico", "2026-10-03", 2_000),
        purchase("c", "velho", "2026-10-03", 500),
        purchase("d", "nu", "2026-10-03", 9_000),
      ],
    });

    const groups = pendingCardGroups(state);

    expect(groups.map((g) => [g.source.id, g.transactions.length, g.netMinor])).toEqual([
      ["generico", 2, 3_000],
      ["velho", 1, 500],
    ]);
  });

  it("estorno no cartão abate o total do grupo", () => {
    const state = world({
      methods: [legacyCard("g")],
      transactions: [
        purchase("a", "g", "2026-10-02", 5_000),
        purchase("e", "g", "2026-10-03", 1_000, { kind: "income" }),
      ],
    });
    expect(pendingCardGroups(state)[0]?.netMinor).toBe(4_000);
  });

  it("leva as séries vivas do mesmo método junto", () => {
    const state = world({
      methods: [legacyCard("g")],
      transactions: [purchase("a", "g", "2026-10-02")],
      recurrences: [
        series("assinatura", "g"),
        series("apagada", "g", { deletedAt: DELETED_AT }),
        series("outra", "nu"),
      ],
    });
    expect(pendingCardGroups(state)[0]?.recurrences.map((r) => r.id)).toEqual(["assinatura"]);
  });

  it("ignora lançamento apagado e cartão por completar sem lançamento vivo", () => {
    const state = world({
      methods: [legacyCard("g"), legacyCard("vazio")],
      transactions: [purchase("a", "g", "2026-10-02", 1_000, { deletedAt: DELETED_AT })],
    });
    expect(pendingCardGroups(state)).toEqual([]);
  });

  it("método apagado não dispara: o lançamento mostra 'Forma removida'", () => {
    const state = world({
      methods: [legacyCard("g", { deletedAt: DELETED_AT })],
      transactions: [purchase("a", "g", "2026-10-02")],
    });
    expect(pendingCardGroups(state)).toEqual([]);
  });

  it("método que não é crédito, ou que nem existe, não dispara", () => {
    const state = world({
      methods: [card("pix", { kind: "pix", bank: null, closingDay: null, dueDay: null })],
      transactions: [purchase("a", "pix", "2026-10-02"), purchase("b", "fantasma", "2026-10-02")],
    });
    expect(pendingCardGroups(state)).toEqual([]);
  });

  it("é puro: o mesmo estado dá o mesmo resultado", () => {
    const state = world({
      methods: [legacyCard("g")],
      transactions: [purchase("a", "g", "2026-10-02")],
    });
    expect(pendingCardGroups(state)).toEqual(pendingCardGroups(state));
  });
});

describe("unusedGenericCard", () => {
  const genesis = legacyCard(LEGACY_CREDIT_METHOD_ID, {
    name: "Cartão de crédito",
    updatedAt: GENESIS_HLC,
  });

  it("é o genérico intocado e sem nenhuma referência viva", () => {
    expect(unusedGenericCard(world({ methods: [genesis] }))?.id).toBe(LEGACY_CREDIT_METHOD_ID);
  });

  it("deixa de ser 'sem uso' com lançamento ou série viva", () => {
    expect(
      unusedGenericCard(
        world({
          methods: [genesis],
          transactions: [purchase("a", LEGACY_CREDIT_METHOD_ID, "2026-10-02")],
        }),
      ),
    ).toBeNull();
    expect(
      unusedGenericCard(
        world({ methods: [genesis], recurrences: [series("s", LEGACY_CREDIT_METHOD_ID)] }),
      ),
    ).toBeNull();
  });

  it("referência apagada não conta como uso", () => {
    const state = world({
      methods: [genesis],
      transactions: [
        purchase("a", LEGACY_CREDIT_METHOD_ID, "2026-10-02", 1_000, { deletedAt: DELETED_AT }),
      ],
    });
    expect(unusedGenericCard(state)).not.toBeNull();
  });

  it("o genérico já editado pela pessoa é dela, e fica", () => {
    const edited = { ...genesis, updatedAt: "1754568000000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ" };
    expect(unusedGenericCard(world({ methods: [edited] }))).toBeNull();
  });

  it("com os dados preenchidos já é um cartão de verdade", () => {
    const filled = card(LEGACY_CREDIT_METHOD_ID, { updatedAt: GENESIS_HLC });
    expect(unusedGenericCard(world({ methods: [filled] }))).toBeNull();
  });
});

describe("listPickableMethods", () => {
  it("esconde o genérico sem uso e mantém o resto", () => {
    const state = world({
      methods: [
        legacyCard(LEGACY_CREDIT_METHOD_ID, { name: "Cartão de crédito", updatedAt: GENESIS_HLC }),
        card("nu", { name: "Nubank" }),
      ],
    });
    expect(listPickableMethods(state).map((m) => m.id)).toEqual(["nu"]);
  });

  it("mantém o genérico quando algum lançamento ainda aponta para ele", () => {
    const state = world({
      methods: [
        legacyCard(LEGACY_CREDIT_METHOD_ID, { name: "Cartão de crédito", updatedAt: GENESIS_HLC }),
      ],
      transactions: [purchase("a", LEGACY_CREDIT_METHOD_ID, "2026-10-02")],
    });
    expect(listPickableMethods(state)).toHaveLength(1);
  });
});
