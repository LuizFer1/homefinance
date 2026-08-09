import { describe, expect, it } from "vitest";
import { createDeviceClock } from "./device-clock";
import { compareHlc, parseHlc } from "./hlc";

const DEVICE_A = "01J9F3K2M7QX8YB4TVWZ0DCEHR";
const WALL = 1_754_697_600_000;

/**
 * Decodifica os 10 primeiros caracteres do ULID. Crockford base32 pula I, L, O e
 * U, então `Number.parseInt(s, 32)` — que usa 0-9a-v — devolve outro número.
 */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function decodeUlidMillis(ulid: string): number {
  return [...ulid.slice(0, 10)].reduce((acc, char) => acc * 32 + CROCKFORD.indexOf(char), 0);
}

function clockAt(startAt = WALL, initialHlc: string | null = null) {
  let millis = startAt;
  return createDeviceClock({
    deviceId: DEVICE_A,
    initialHlc,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  });
}

describe("createDeviceClock", () => {
  it("expõe o deviceId que recebeu", () => {
    expect(clockAt().deviceId).toBe(DEVICE_A);
  });

  it("emite HLC estritamente crescente em chamadas sucessivas", () => {
    // Esta é a propriedade que justifica um relógio por aparelho em vez de um por
    // store: dois relógios independentes produziriam HLCs entrelaçados, cada
    // escrita de uma cairia antes do lastHlc da outra, e cada tecla forçaria
    // refold do log inteiro.
    const clock = clockAt();
    const emitidos = [
      clock.envelope("a").hlc,
      clock.envelope("b").hlc,
      clock.envelope("c").hlc,
      clock.envelope("d").hlc,
    ];

    for (let i = 1; i < emitidos.length; i += 1) {
      expect(compareHlc(emitidos[i - 1] ?? "", emitidos[i] ?? "")).toBe(-1);
    }
  });

  it("emite eventId único a cada envelope", () => {
    const clock = clockAt();
    const ids = [clock.envelope("a").eventId, clock.envelope("a").eventId];

    expect(ids[0]).not.toBe(ids[1]);
  });

  it("usa o mesmo instante para o ULID e para o HLC do mesmo envelope", () => {
    // `now()` chamado duas vezes daria um ULID de um milissegundo e um HLC de
    // outro, e as duas ordenações do app deixariam de coincidir.
    const clock = clockAt();

    const envelope = clock.envelope("a");

    expect(decodeUlidMillis(envelope.eventId)).toBe(parseHlc(envelope.hlc)?.millis);
  });

  it("recupera o relógio a partir de um HLC conhecido", () => {
    const futuro = `${String(WALL + 60_000).padStart(13, "0")}-0007-${DEVICE_A}`;
    const clock = clockAt(WALL, futuro);

    expect(compareHlc(futuro, clock.envelope("a").hlc)).toBe(-1);
  });

  it("newEntity gera entityId e o usa no envelope", () => {
    const clock = clockAt();

    const envelope = clock.newEntity();

    expect(envelope.entityId).toHaveLength(26);
    expect(envelope.entityId).not.toBe(envelope.eventId);
  });

  it("carrega o deviceId em todo envelope", () => {
    expect(clockAt().envelope("a").deviceId).toBe(DEVICE_A);
  });
});
