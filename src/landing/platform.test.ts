import { describe, expect, it } from "vitest";
import { detectPlatform } from "./platform";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// iPadOS 13+ se anuncia como Mac: o UA sozinho nao separa iPad de MacBook.
const IPAD_OU_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
  it("reconhece iPhone pelo UA", () => {
    expect(detectPlatform({ userAgent: IPHONE, maxTouchPoints: 5, coarse: true })).toBe("ios");
  });

  it("reconhece iPad que se anuncia como Mac pelo toque", () => {
    expect(detectPlatform({ userAgent: IPAD_OU_MAC, maxTouchPoints: 5, coarse: true })).toBe("ios");
  });

  it("Mac de verdade, sem toque, e computador", () => {
    expect(detectPlatform({ userAgent: IPAD_OU_MAC, maxTouchPoints: 0, coarse: false })).toBe(
      "desktop",
    );
  });

  it("reconhece Android pelo UA", () => {
    expect(detectPlatform({ userAgent: ANDROID, maxTouchPoints: 5, coarse: true })).toBe("android");
  });

  it("computador com mouse e desktop", () => {
    expect(detectPlatform({ userAgent: WINDOWS, maxTouchPoints: 0, coarse: false })).toBe(
      "desktop",
    );
  });

  it("aparelho de toque desconhecido cai nas instrucoes genericas do Android", () => {
    expect(
      detectPlatform({ userAgent: "Mozilla/5.0 (X11)", maxTouchPoints: 5, coarse: true }),
    ).toBe("android");
  });
});
