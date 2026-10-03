import { describe, expect, it } from "vitest";
import { isWithdrawReason, reasonLabel } from "./reserve";

describe("isWithdrawReason", () => {
  it("aceita os cinco motivos e recusa o resto", () => {
    expect(isWithdrawReason("health")).toBe(true);
    expect(isWithdrawReason("other")).toBe(true);
    expect(isWithdrawReason(null)).toBe(false);
    expect(isWithdrawReason("alien")).toBe(false);
    // Herdado de Object.prototype não é motivo.
    expect(isWithdrawReason("toString")).toBe(false);
  });

  it("reasonLabel cai em Outro para motivo desconhecido", () => {
    expect(reasonLabel("car")).toBe("Carro");
    expect(reasonLabel("alien")).toBe("Outro");
    expect(reasonLabel(null)).toBe("Outro");
  });
});
