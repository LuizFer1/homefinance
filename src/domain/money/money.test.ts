import { describe, expect, it } from "vitest";
import { formatBRL } from "./money";

/** Intl usa espaço não-quebrável entre símbolo e número. */
function normalize(value: string): string {
  return value.replace(/\u00a0/g, " ");
}

describe("formatBRL", () => {
  it("formata centavos como moeda brasileira", () => {
    expect(normalize(formatBRL(123456))).toBe("R$ 1.234,56");
    expect(normalize(formatBRL(0))).toBe("R$ 0,00");
  });
});
