import { describe, expect, it } from "vitest";
import { eachPeriod, occurrenceKey, occurrenceOn } from "./schedule";

describe("eachPeriod", () => {
  it("mensal preenche de start ate until", () => {
    expect(eachPeriod("2026-01-15", "2026-03-20", "monthly")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("bimestral respeita a ancora", () => {
    expect(eachPeriod("2026-01-05", "2026-07-01", "bimonthly")).toEqual([
      "2026-01",
      "2026-03",
      "2026-05",
      "2026-07",
    ]);
  });

  it("anual so aniversarios", () => {
    expect(eachPeriod("2024-03-10", "2026-08-01", "annual")).toEqual([
      "2024-03",
      "2025-03",
      "2026-03",
    ]);
  });
});

describe("occurrenceOn", () => {
  it("dia fixo e dia util", () => {
    expect(occurrenceOn("2026-08", "dayOfMonth", 10)).toBe("2026-08-10");
    expect(occurrenceOn("2026-08", "nthBusinessDay", 5)).toBe("2026-08-07");
  });
});

describe("occurrenceKey", () => {
  it("compõe id da serie e competencia", () => {
    expect(occurrenceKey("ABC", "2026-08")).toBe("ABC:2026-08");
  });
});
