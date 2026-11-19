import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256 } from "./sha256";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Vetores do FIPS 180-2 (apêndice B): qualquer `sha256sum` confere. O id v2 é
 * o mesmo no hub (`sha2` do Rust) só se este hash for o SHA-256 de verdade, bit
 * a bit — um erro no preenchimento só aparece em certos comprimentos, por isso
 * as bordas de bloco abaixo.
 */
describe("sha256", () => {
  it("vetores do FIPS 180-2", () => {
    expect(hex(sha256(utf8("")))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(hex(sha256(utf8("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    // 448 bits: a mensagem cabe num bloco, mas o tamanho já não — 2 blocos.
    expect(hex(sha256(utf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("entrada de varios blocos", () => {
    const text =
      "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";
    expect(hex(sha256(utf8(text)))).toBe(
      "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
    );
  });

  it("bate com node:crypto nas bordas do preenchimento e em UTF-8 multibyte", () => {
    const lengths = [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000];
    for (const length of lengths) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 31 + 7) & 0xff);
      expect(hex(sha256(bytes)), `comprimento ${length}`).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    }
    for (const text of ["ç:2026-11", "😀", "Pão de açúcar — R$ 12,00", "日本語"]) {
      expect(hex(sha256(utf8(text))), text).toBe(
        createHash("sha256").update(text, "utf8").digest("hex"),
      );
    }
  });
});
