import { describe, expect, it } from "vitest";
import { stableEntityIdV1 } from "./stable-id";

describe("stableEntityIdV1", () => {
  it("e deterministico e de largura fixa", () => {
    const a = stableEntityIdV1("rec:2026-08");
    const b = stableEntityIdV1("rec:2026-08");
    expect(a).toBe(b);
    expect(a).toHaveLength(26);
  });

  it("sementes diferentes produzem ids diferentes", () => {
    expect(stableEntityIdV1("rec:2026-08")).not.toBe(stableEntityIdV1("rec:2026-09"));
  });
});
