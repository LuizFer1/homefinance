/** Alfabeto Crockford base32: sem I, L, O e U, para não confundir na leitura. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export type Ulid = string;

/** Fonte de aleatoriedade: devolve `count` valores no intervalo [0, 31]. */
export type RandomChunk = (count: number) => number[];

function encodeTime(millis: number): string {
  let out = "";
  let rest = millis;
  for (let i = 0; i < TIME_LEN; i += 1) {
    out = ALPHABET.charAt(rest % 32) + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

function encodeRandom(values: number[]): string {
  let out = "";
  for (const value of values) {
    out += ALPHABET.charAt(value);
  }
  return out;
}

/** Soma 1 ao bloco aleatório tratado como número base 32, com carry da direita para a esquerda. */
function increment(values: number[]): number[] {
  const next = [...values];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const current = next[i] ?? 0;
    if (current < 31) {
      next[i] = current + 1;
      return next;
    }
    next[i] = 0;
  }
  throw new Error("ULID esgotou os 80 bits de aleatoriedade no mesmo milissegundo");
}

/**
 * Fábrica com estado: guarda o último milissegundo e o último bloco aleatório
 * para garantir monotonia mesmo com várias chamadas no mesmo instante — ou com
 * o relógio de parede andando para trás.
 */
export function createUlidFactory(randomChunk: RandomChunk): (millis: number) => Ulid {
  let lastMillis = -1;
  let lastRandom: number[] = [];

  return (millis: number): Ulid => {
    if (!Number.isInteger(millis) || millis < 0) {
      throw new Error(`ULID exige millis inteiro e não-negativo, recebeu ${millis}`);
    }
    if (millis > lastMillis) {
      lastMillis = millis;
      lastRandom = randomChunk(RANDOM_LEN);
    } else {
      lastRandom = increment(lastRandom);
    }
    return encodeTime(lastMillis) + encodeRandom(lastRandom);
  };
}

/**
 * Fonte real de aleatoriedade. Vive aqui, e não em `main.tsx`, porque `ids/` é o
 * único lugar de `domain/` autorizado a tocar em `crypto`. 256 é múltiplo de 32,
 * então o módulo não introduz viés.
 */
export function cryptoRandomChunk(count: number): number[] {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte % 32);
}
