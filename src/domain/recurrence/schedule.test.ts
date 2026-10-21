import { describe, expect, it } from "vitest";
import { eachPeriod, occurrenceKey, occurrenceOn, periodOf, previousPeriod } from "./schedule";

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

describe("semanal e quinzenal", () => {
  it("semanal anda de 7 em 7 dias, atravessando mes e ano", () => {
    expect(eachPeriod("2026-12-21", "2027-01-12", "weekly")).toEqual([
      "2026-12-21",
      "2026-12-28",
      "2027-01-04",
      "2027-01-11",
    ]);
  });

  it("quinzenal anda de 14 em 14 dias, a partir da ancora", () => {
    expect(eachPeriod("2026-01-20", "2026-03-20", "biweekly")).toEqual([
      "2026-01-20",
      "2026-02-03",
      "2026-02-17",
      "2026-03-03",
      "2026-03-17",
    ]);
  });

  it("start depois de until nao gera nada", () => {
    expect(eachPeriod("2026-05-10", "2026-05-09", "weekly")).toEqual([]);
  });

  it("a competencia ja e a data: occurrenceOn ignora Quando e Dia", () => {
    expect(occurrenceOn("2026-03-17", "nthBusinessDay", 5)).toBe("2026-03-17");
    expect(occurrenceOn("2026-03-17", "dayOfMonth", 31)).toBe("2026-03-17");
  });

  it("frequencia desconhecida (versao futura) nao gera e nao trava", () => {
    expect(eachPeriod("2026-01-01", "2026-12-31", "fortnightly" as never)).toEqual([]);
  });

  it("periodOf e previousPeriod seguem o formato da competencia", () => {
    expect(periodOf("weekly", "2026-03-17")).toBe("2026-03-17");
    expect(periodOf("monthly", "2026-03-17")).toBe("2026-03");
    expect(previousPeriod("2026-03-01")).toBe("2026-02-28");
    expect(previousPeriod("2026-03")).toBe("2026-02");
  });
});
