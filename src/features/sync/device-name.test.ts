import { describe, expect, it } from "vitest";
import { guessDeviceName } from "./device-name";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

describe("guessDeviceName", () => {
  it("sugere pelo sistema do aparelho", () => {
    expect(guessDeviceName(IPHONE)).toBe("iPhone");
    expect(guessDeviceName(ANDROID)).toBe("Android");
    expect(guessDeviceName(WINDOWS)).toBe("Computador Windows");
    expect(guessDeviceName("")).toBe("Celular");
  });
});
