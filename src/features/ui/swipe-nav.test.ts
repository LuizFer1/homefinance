import { describe, expect, it } from "vitest";
import {
  adjacentScreen,
  dragOffsetPx,
  lockAxis,
  resolveSwipe,
  SWIPE_EDGE_DAMPING,
  SWIPE_THRESHOLD_PX,
} from "./swipe-nav";

const ABAS = ["dashboard", "inicio", "config"] as const;

describe("resolveSwipe", () => {
  it("direita longa vira prev; esquerda longa vira next", () => {
    expect(resolveSwipe(SWIPE_THRESHOLD_PX, 400)).toBe("prev");
    expect(resolveSwipe(-SWIPE_THRESHOLD_PX, 400)).toBe("next");
  });

  it("abaixo do limiar e lento nao troca", () => {
    expect(resolveSwipe(20, 400)).toBeNull();
    expect(resolveSwipe(-20, 400)).toBeNull();
  });

  it("flick rapido e curto ainda conta", () => {
    // 30px em 50ms ≈ 0.6 px/ms > 0.35
    expect(resolveSwipe(30, 50)).toBe("prev");
    expect(resolveSwipe(-30, 50)).toBe("next");
  });

  it("delta zero nao navega", () => {
    expect(resolveSwipe(0, 10)).toBeNull();
  });
});

describe("adjacentScreen", () => {
  it("avanca e recua no meio", () => {
    expect(adjacentScreen(ABAS, "inicio", "prev")).toBe("dashboard");
    expect(adjacentScreen(ABAS, "inicio", "next")).toBe("config");
  });

  it("nas bordas devolve null", () => {
    expect(adjacentScreen(ABAS, "dashboard", "prev")).toBeNull();
    expect(adjacentScreen(ABAS, "config", "next")).toBeNull();
  });
});

describe("dragOffsetPx", () => {
  it("no miolo segue o dedo 1:1", () => {
    expect(dragOffsetPx(40, true, true)).toBe(40);
    expect(dragOffsetPx(-40, true, true)).toBe(-40);
  });

  it("na borda amortece", () => {
    expect(dragOffsetPx(40, false, true)).toBe(40 * SWIPE_EDGE_DAMPING);
    expect(dragOffsetPx(-40, true, false)).toBe(-40 * SWIPE_EDGE_DAMPING);
  });
});

describe("lockAxis", () => {
  it("aguarda o limiar antes de decidir", () => {
    expect(lockAxis(4, 3)).toBeNull();
  });

  it("prefere o eixo com maior deslocamento", () => {
    expect(lockAxis(20, 5)).toBe("horizontal");
    expect(lockAxis(5, 20)).toBe("vertical");
  });
});
