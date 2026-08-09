import { describe, expect, it } from "vitest";
import { compareHlc, createHlcClock, formatHlc, parseHlc } from "./hlc";

const DEVICE_A = "01J9F3K2M7QX8YB4TVWZ0DCEHR";
const DEVICE_B = "01J9F3K2M7QX8YB4TVWZ0DCEHS";
const WALL = 1_754_697_600_000;

describe("formatHlc / parseHlc", () => {
  it("serializa com largura fixa", () => {
    expect(formatHlc({ millis: WALL, counter: 0, deviceId: DEVICE_A })).toBe(
      `1754697600000-0000-${DEVICE_A}`,
    );
  });

  it("faz round-trip", () => {
    const text = formatHlc({ millis: WALL, counter: 255, deviceId: DEVICE_A });

    expect(parseHlc(text)).toEqual({ millis: WALL, counter: 255, deviceId: DEVICE_A });
  });

  it("rejeita texto fora do formato", () => {
    expect(parseHlc("não é um hlc")).toBeNull();
    expect(parseHlc(`${WALL}-0-${DEVICE_A}`)).toBeNull();
  });
});

describe("compareHlc", () => {
  it("ordena por millis, depois counter, depois deviceId", () => {
    const base = formatHlc({ millis: WALL, counter: 1, deviceId: DEVICE_A });

    expect(compareHlc(base, formatHlc({ millis: WALL + 1, counter: 0, deviceId: DEVICE_A }))).toBe(
      -1,
    );
    expect(compareHlc(base, formatHlc({ millis: WALL, counter: 2, deviceId: DEVICE_A }))).toBe(-1);
    expect(compareHlc(base, formatHlc({ millis: WALL, counter: 1, deviceId: DEVICE_B }))).toBe(-1);
    expect(compareHlc(base, base)).toBe(0);
  });
});

describe("createHlcClock", () => {
  it("zera o counter quando o relógio de parede avança", () => {
    const clock = createHlcClock(DEVICE_A);

    clock.tick(WALL);
    const next = clock.tick(WALL + 1);

    expect(parseHlc(next)).toEqual({ millis: WALL + 1, counter: 0, deviceId: DEVICE_A });
  });

  it("avança o counter quando o relógio de parede não anda", () => {
    const clock = createHlcClock(DEVICE_A);

    clock.tick(WALL);
    const second = clock.tick(WALL);

    expect(parseHlc(second)).toEqual({ millis: WALL, counter: 1, deviceId: DEVICE_A });
  });

  it("continua crescendo quando o relógio de parede volta atrás", () => {
    const clock = createHlcClock(DEVICE_A);

    const first = clock.tick(WALL);
    const second = clock.tick(WALL - 60_000);

    expect(compareHlc(first, second)).toBe(-1);
  });

  it("salta para o HLC remoto maior ao observá-lo", () => {
    const clock = createHlcClock(DEVICE_A);
    const remote = formatHlc({ millis: WALL + 10_000, counter: 7, deviceId: DEVICE_B });

    clock.observe(remote);
    const local = clock.tick(WALL);

    expect(compareHlc(remote, local)).toBe(-1);
  });

  it("inicializa a partir de um HLC conhecido", () => {
    const initial = formatHlc({ millis: WALL, counter: 3, deviceId: DEVICE_B });
    const clock = createHlcClock(DEVICE_A, initial);

    const next = clock.tick(WALL);

    expect(parseHlc(next)).toEqual({ millis: WALL, counter: 4, deviceId: DEVICE_A });
  });
});
