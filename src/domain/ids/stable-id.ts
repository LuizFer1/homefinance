import type { Ulid } from "./ulid";

/** Mesmo alfabeto Crockford do ULID — ids determinísticos legíveis e estáveis. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Identidade de agregado derivada só do conteúdo, igual em qualquer aparelho.
 *
 * Materializar a ocorrência de março do mesmo salário em dois telefones offline
 * **tem** que produzir o mesmo `entityId`: se cada um gerasse ULID aleatório,
 * o sync traria dois salários no extrato. Com o mesmo id, as duas linhas são a
 * mesma linha, e o LWW por linha as converge.
 */
export function stableEntityId(seed: string): Ulid {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0xdeadbeef;

  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x01000193) ^ Math.imul(i + 1, 0x9e3779b9);
  }

  let a = h1 >>> 0;
  let b = h2 >>> 0;
  let out = "";

  for (let i = 0; i < 26; i += 1) {
    out += ALPHABET[(a + b + i * 17) & 31];
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    b = (Math.imul(b ^ a, 22695477) + 1) >>> 0;
  }

  return out;
}
