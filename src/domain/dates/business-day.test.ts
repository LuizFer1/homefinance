import { describe, expect, it } from "vitest";
import {
  dayOfMonthClamped,
  isBusinessDay,
  lastDayOfMonth,
  nthBusinessDayOfMonth,
} from "./business-day";

describe("isBusinessDay", () => {
  it("segunda a sexta sao uteis; sabado e domingo nao", () => {
    // 2026-08-10 = segunda, 11=ter, ..., 14=sex, 15=sab, 16=dom
    expect(isBusinessDay("2026-08-10")).toBe(true);
    expect(isBusinessDay("2026-08-14")).toBe(true);
    expect(isBusinessDay("2026-08-15")).toBe(false);
    expect(isBusinessDay("2026-08-16")).toBe(false);
  });
});

describe("dayOfMonthClamped", () => {
  it("respeita o dia pedido", () => {
    expect(dayOfMonthClamped("2026-08", 5)).toBe("2026-08-05");
  });

  it("31 de fevereiro vira o ultimo dia do mes", () => {
    expect(dayOfMonthClamped("2026-02", 31)).toBe("2026-02-28");
    expect(dayOfMonthClamped("2024-02", 31)).toBe("2024-02-29");
  });
});

describe("nthBusinessDayOfMonth", () => {
  it("1o dia util de agosto/2026 e dia 3 (mes comeca no sabado)", () => {
    // 2026-08-01 sab, 02 dom, 03 seg
    expect(nthBusinessDayOfMonth("2026-08", 1)).toBe("2026-08-03");
  });

  it("5o dia util de agosto/2026 e dia 7", () => {
    // 3,4,5,6,7
    expect(nthBusinessDayOfMonth("2026-08", 5)).toBe("2026-08-07");
  });

  it("N maior que os uteis do mes devolve o ultimo util", () => {
    expect(nthBusinessDayOfMonth("2026-08", 99)).toBe("2026-08-31");
  });
});

describe("lastDayOfMonth", () => {
  it("conhece fevereiro e meses de 30", () => {
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2026-04")).toBe("2026-04-30");
  });
});
