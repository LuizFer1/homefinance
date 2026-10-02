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

const DAY_MS = 86_400_000;

/**
 * HLC mais baixo que qualquer escrita humana numa linha datada de `date`
 * ('YYYY-MM-DD'): meia-noite UTC do dia anterior, contador zero.
 *
 * Para linhas que o app gera sozinho e que uma edição do usuário tem que
 * vencer no LWW por linha, mesmo que a geração aconteça depois noutro aparelho
 * offline (estimativa de série variável). A linha só é gerada com a data já
 * vencida, então toda edição nela acontece a partir de `date` no fuso local —
 * e o dia anterior em UTC fica abaixo disso até UTC+24h.
 *
 * Não passa pelo relógio do aparelho: é um carimbo fixo, e o relógio não
 * regride por causa dele.
 */
export function floorHlc(date: string, deviceId: Ulid): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) throw new Error(`floorHlc exige 'YYYY-MM-DD', recebeu ${date}`);
  const millis = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - DAY_MS;
  return formatHlc({ millis, counter: 0, deviceId });
}

export interface HlcClock {
  /** Avança o relógio e devolve o HLC de uma nova escrita local. */
  tick: (wall: number) => string;
  /** Salta para `max(local, remoto)` ao receber uma linha de fora. */
  observe: (remote: string) => void;
  current: () => string;
}

export function createHlcClock(deviceId: Ulid, initial?: string | null): HlcClock {
  let millis = 0;
  let counter = 0;

  // `initial` inválido é ignorado e o relógio nasce em zero. Silêncio deliberado:
  // a sessão deriva `initial` do maior HLC gravado nas tabelas, e já descarta ali
  // o valor que não parseia. Lançar aqui transformaria uma coluna corrompida em
  // app que não abre, o que é pior que um relógio atrasado.
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
