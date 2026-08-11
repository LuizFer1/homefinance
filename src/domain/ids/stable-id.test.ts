import { describe, expect, it } from "vitest";
import { stableEntityId } from "./stable-id";

describe("stableEntityId", () => {
  it("e deterministico e de largura fixa", () => {
    const a = stableEntityId("rec:2026-08");
    const b = stableEntityId("rec:2026-08");
    expect(a).toBe(b);
    expect(a).toHaveLength(26);
  });

  it("sementes diferentes produzem ids diferentes", () => {
    expect(stableEntityId("rec:2026-08")).not.toBe(stableEntityId("rec:2026-09"));
  });
});
