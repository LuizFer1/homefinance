import { describe, expect, it } from "vitest";
import { compareHlc } from "./hlc";
import { createRowClock } from "./row-clock";

const DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";

describe("createRowClock", () => {
  it("stamp devolve HLC crescente mesmo no mesmo milissegundo", () => {
    const clock = createRowClock({
      deviceId: DEVICE,
      now: () => 1_754_697_600_000,
      randomChunk: (count) => Array.from({ length: count }, () => 0),
    });
    const a = clock.stamp();
    const b = clock.stamp();
    expect(compareHlc(b.hlc, a.hlc)).toBe(1);
    expect(a.iso).toBe("2025-08-09T00:00:00.000Z");
  });

  it("não regride abaixo do initialHlc", () => {
    const initial = `1754697700000-0000-${DEVICE}`;
    const clock = createRowClock({
      deviceId: DEVICE,
      initialHlc: initial,
      now: () => 1_754_697_600_000,
      randomChunk: (count) => Array.from({ length: count }, () => 0),
    });
    expect(compareHlc(clock.stamp().hlc, initial)).toBe(1);
  });

  it("newId gera ids distintos", () => {
    let millis = 1_754_697_600_000;
    const clock = createRowClock({
      deviceId: DEVICE,
      now: () => {
        millis += 1;
        return millis;
      },
      randomChunk: (count) => Array.from({ length: count }, () => 0),
    });
    expect(clock.newId()).not.toBe(clock.newId());
  });
});

describe("observe", () => {
  const randomChunk = (count: number) => Array.from({ length: count }, () => 0);

  it("salta para o HLC remoto e o próximo carimbo fica acima dele", () => {
    const clock = createRowClock({
      deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHZ",
      now: () => 1_000,
      randomChunk,
    });
    const remote = "0000000005000-0003-01J9F3K2M7QX8YB4TVWZ0DCEHA";

    clock.observe(remote);

    expect(compareHlc(clock.stamp().hlc, remote)).toBeGreaterThan(0);
  });

  it("HLC remoto inválido é ignorado", () => {
    const clock = createRowClock({
      deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHZ",
      now: () => 1_000,
      randomChunk,
    });
    const before = clock.stamp().hlc;

    clock.observe("lixo");

    expect(compareHlc(clock.stamp().hlc, before)).toBeGreaterThan(0);
    expect(clock.stamp().hlc.startsWith("0000000001000")).toBe(true);
  });
});
