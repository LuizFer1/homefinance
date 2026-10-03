import { describe, expect, it } from "vitest";
import { dayOfDate, deadlineLabel, movementDateLabel } from "./format";

describe("format", () => {
  it("prazo: 'jul 2027'; no ano corrente, só o mês", () => {
    expect(deadlineLabel("2027-07", "2026-09-20")).toBe("jul 2027");
    expect(deadlineLabel("2026-12", "2026-09-20")).toBe("dez");
  });
  it("dia do mês sem zero à esquerda", () => {
    expect(dayOfDate("2026-09-06")).toBe(6);
    expect(dayOfDate("2026-02-28")).toBe(28);
  });
  it("data do movimento: '6 set'", () => {
    expect(movementDateLabel("2026-09-06")).toBe("6 set");
  });
});
