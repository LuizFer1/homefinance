import { describe, expect, it } from "vitest";
import { compareHlc, formatHlc, parseHlc } from "../clock/hlc";
import {
  buildDefaultRows,
  DEFAULT_CATEGORIES,
  DEFAULT_METHODS,
  GENESIS_HLC,
  LEGACY_CREDIT_METHOD_ID,
} from "./defaults";

describe("buildDefaultRows", () => {
  it("é idêntico byte a byte em qualquer aparelho", () => {
    expect(JSON.stringify(buildDefaultRows())).toBe(JSON.stringify(buildDefaultRows()));
  });

  it("monta 12 categorias e 3 formas (sem o cartão genérico), com ids distintos e estáveis", () => {
    const { categories, paymentMethods } = buildDefaultRows();
    expect(categories).toHaveLength(12);
    expect(paymentMethods.map((m) => m.kind)).toEqual(["cash", "pix", "debit"]);
    const ids = [...categories, ...paymentMethods].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(categories[0]?.id).toBe(DEFAULT_CATEGORIES[0]?.id);
    expect(paymentMethods[1]?.id).toBe(DEFAULT_METHODS[1]?.id);
  });

  it("não semeia o cartão de crédito genérico, mas a lista de fusão ainda o conhece", () => {
    const { paymentMethods } = buildDefaultRows();
    expect(paymentMethods.some((m) => m.id === LEGACY_CREDIT_METHOD_ID)).toBe(false);
    // Aparelhos na versão velha ainda semeiam cópias dele: a fusão precisa vê-lo.
    expect(DEFAULT_METHODS.some((m) => m.id === LEGACY_CREDIT_METHOD_ID)).toBe(true);
  });

  it("nasce na gênese, sujo e vivo", () => {
    for (const row of [...buildDefaultRows().categories, ...buildDefaultRows().paymentMethods]) {
      expect(row.updatedAt).toBe(GENESIS_HLC);
      expect(row.deletedAt).toBeNull();
      expect(row.dirty).toBe(1);
      expect(row.mergedInto).toBeNull();
    }
  });
});

describe("GENESIS_HLC", () => {
  it("é um HLC válido abaixo de qualquer escrita real", () => {
    expect(parseHlc(GENESIS_HLC)).not.toBeNull();
    const real = formatHlc({ millis: 1, counter: 0, deviceId: "00000000000000000000000000" });
    expect(compareHlc(GENESIS_HLC, real)).toBeLessThan(0);
  });
});
