import { describe, expect, it } from "vitest";
import { createUlidFactory, cryptoRandomChunk } from "./ulid";

/** Fonte determinística: sempre o mesmo bloco de valores. */
function fixedRandom(count: number): number[] {
  return Array.from({ length: count }, () => 0);
}

describe("createUlidFactory", () => {
  it("gera 26 caracteres do alfabeto Crockford base32", () => {
    const nextUlid = createUlidFactory(fixedRandom);

    const ulid = nextUlid(1_754_697_600_000);

    expect(ulid).toHaveLength(26);
    expect(ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("é monotônico dentro do mesmo milissegundo", () => {
    const nextUlid = createUlidFactory(fixedRandom);
    const millis = 1_754_697_600_000;

    const first = nextUlid(millis);
    const second = nextUlid(millis);
    const third = nextUlid(millis);

    expect(first < second).toBe(true);
    expect(second < third).toBe(true);
  });

  it("ordena lexicograficamente na mesma ordem do tempo", () => {
    const nextUlid = createUlidFactory(fixedRandom);

    const older = nextUlid(1_754_697_600_000);
    const newer = nextUlid(1_754_697_600_001);

    expect(older < newer).toBe(true);
  });

  it("continua crescendo quando o relógio de parede volta atrás", () => {
    const nextUlid = createUlidFactory(fixedRandom);

    const first = nextUlid(1_754_697_600_000);
    const afterRegression = nextUlid(1_754_697_500_000);

    expect(first < afterRegression).toBe(true);
  });

  it("propaga o carry entre dígitos do bloco aleatório", () => {
    // Último dígito começa em 31: o próximo incremento tem que estourar para o dígito à esquerda.
    const nextUlid = createUlidFactory((count) =>
      Array.from({ length: count }, (_, index) => (index === count - 1 ? 31 : 0)),
    );
    const millis = 1_754_697_600_000;

    const first = nextUlid(millis);
    const second = nextUlid(millis);

    expect(first.endsWith("Z")).toBe(true);
    expect(second.endsWith("0")).toBe(true);
    expect(first < second).toBe(true);
  });

  it("lança quando o bloco aleatório estoura no mesmo milissegundo", () => {
    const nextUlid = createUlidFactory((count) => Array.from({ length: count }, () => 31));
    const millis = 1_754_697_600_000;

    nextUlid(millis);

    expect(() => nextUlid(millis)).toThrow(/esgotou/);
  });

  it("aceita millis zero", () => {
    const nextUlid = createUlidFactory(fixedRandom);

    expect(nextUlid(0)).toHaveLength(26);
  });

  it("rejeita millis negativo ou fracionário", () => {
    const nextUlid = createUlidFactory(fixedRandom);

    expect(() => nextUlid(-1)).toThrow(/inteiro e não-negativo/);
    expect(() => nextUlid(1.5)).toThrow(/inteiro e não-negativo/);
  });
});

describe("cryptoRandomChunk", () => {
  it("devolve a quantidade pedida, toda dentro de [0, 31]", () => {
    const values = cryptoRandomChunk(16);

    expect(values).toHaveLength(16);
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(31);
    }
  });
});
