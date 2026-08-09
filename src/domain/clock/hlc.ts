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

  if (initial !== undefined && initial !== null) {
    const parsed = parseHlc(initial);
    if (parsed !== null) {
      millis = parsed.millis;
      counter = parsed.counter;
    }
  }

  return {
    tick(wall: number): string {
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
