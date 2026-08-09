import type { Ulid } from "../ids/ulid";

const MILLIS_LEN = 13;
const COUNTER_LEN = 4;
const MAX_COUNTER = 0xffff;
const HLC_PATTERN = /^(\d{13})-([0-9A-F]{4})-([0-9A-HJKMNP-TV-Z]{26})$/;

export interface Hlc {
  millis: number;
  counter: number;
  deviceId: Ulid;
}

/**
 * Serializa em largura fixa — é isso que faz comparação lexicográfica de string
 * coincidir com comparação semântica.
 *
 * Invariantes que o chamador deve respeitar, porque `padStart` não trunca:
 * `millis` cabe em 13 dígitos (vale até o ano 2286) e `counter` em `0..0xFFFF`.
 * Violar qualquer um dos dois produz um segmento mais longo, que ordena como
 * MENOR que um valor legítimo. `tick` e `observe` nunca violam nenhum dos dois.
 */
export function formatHlc(hlc: Hlc): string {
  const millis = String(hlc.millis).padStart(MILLIS_LEN, "0");
  const counter = hlc.counter.toString(16).toUpperCase().padStart(COUNTER_LEN, "0");
  return `${millis}-${counter}-${hlc.deviceId}`;
}

export function parseHlc(value: string): Hlc | null {
  const match = HLC_PATTERN.exec(value);
  if (match === null) return null;

  const [, millis, counter, deviceId] = match;
  if (millis === undefined || counter === undefined || deviceId === undefined) return null;

  return { millis: Number(millis), counter: Number.parseInt(counter, 16), deviceId };
}

/**
 * Comparação lexicográfica pura. Só é equivalente à comparação semântica porque
 * `formatHlc` usa largura fixa em todos os três segmentos.
 */
export function compareHlc(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export interface HlcClock {
  /** Avança o relógio e devolve o HLC de um novo evento local. */
  tick: (wall: number) => string;
  /** Salta para `max(local, remoto)` ao receber um evento de fora. */
  observe: (remote: string) => void;
  current: () => string;
}

export function createHlcClock(deviceId: Ulid, initial?: string | null): HlcClock {
  let millis = 0;
  let counter = 0;

  // `initial` inválido é ignorado e o relógio nasce em zero. Silêncio deliberado:
  // a store deriva `initial` do maior HLC do log, e todo evento do log já passou
  // por `isValidEvent`, que rejeita HLC que não parseia. Lançar aqui transformaria
  // um `meta` corrompido em app que não abre, o que é pior que um relógio atrasado.
  if (initial !== undefined && initial !== null) {
    const parsed = parseHlc(initial);
    if (parsed !== null) {
      millis = parsed.millis;
      counter = parsed.counter;
    }
  }

  return {
    tick(wall: number): string {
      if (!Number.isInteger(wall) || wall < 0) {
        throw new Error(`HLC exige wall inteiro e não-negativo, recebeu ${wall}`);
      }
      if (wall > millis) {
        millis = wall;
        counter = 0;
      } else if (counter >= MAX_COUNTER) {
        // Estouro do counter: empurra o lógico para o milissegundo seguinte.
        millis += 1;
        counter = 0;
      } else {
        counter += 1;
      }
      return formatHlc({ millis, counter, deviceId });
    },

    observe(remote: string): void {
      const parsed = parseHlc(remote);
      if (parsed === null) return;

      if (parsed.millis > millis) {
        millis = parsed.millis;
        counter = parsed.counter;
      } else if (parsed.millis === millis && parsed.counter > counter) {
        counter = parsed.counter;
      }
    },

    current(): string {
      return formatHlc({ millis, counter, deviceId });
    },
  };
}
