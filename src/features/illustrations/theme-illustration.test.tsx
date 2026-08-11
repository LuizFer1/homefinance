import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { ILLUSTRATIONS } from "./assets";
import { ThemeIllustration } from "./theme-illustration";

afterEach(cleanup);

describe("ThemeIllustration", () => {
  it("home usa o par enter-payment-info (ligth / dark)", () => {
    const { container } = render(<ThemeIllustration name="home" />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0]?.getAttribute("src")).toBe(ILLUSTRATIONS.home.light);
    expect(imgs[1]?.getAttribute("src")).toBe(ILLUSTRATIONS.home.dark);
  });

  it("dashboard usa o par budgeting light / dark", () => {
    const { container } = render(<ThemeIllustration name="dashboard" />);
    const imgs = container.querySelectorAll("img");
    expect(imgs[0]?.getAttribute("src")).toBe(ILLUSTRATIONS.dashboard.light);
    expect(imgs[1]?.getAttribute("src")).toBe(ILLUSTRATIONS.dashboard.dark);
  });
});
