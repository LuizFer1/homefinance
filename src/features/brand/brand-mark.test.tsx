import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { BrandMark } from "./brand-mark";
import { BRAND_ICONS } from "./icons";

afterEach(cleanup);

describe("BrandMark", () => {
  it("renderiza o par maskable 192 claro e escuro", () => {
    const { container } = render(<BrandMark size={32} />);
    const imgs = container.querySelectorAll("img");

    expect(imgs).toHaveLength(2);
    expect(imgs[0]?.getAttribute("src")).toBe(BRAND_ICONS.light.maskable192);
    expect(imgs[1]?.getAttribute("src")).toBe(BRAND_ICONS.dark.maskable192);
    expect(imgs[0]?.getAttribute("width")).toBe("32");
  });

  it("e decorativo: sem texto alternativo proprio", () => {
    const { container } = render(<BrandMark />);
    for (const img of container.querySelectorAll("img")) {
      expect(img.getAttribute("alt")).toBe("");
    }
  });
});
