import { describe, expect, it } from "vitest";
import { hubDeepLinkTarget } from "./deep-link";

describe("hubDeepLinkTarget", () => {
  it("leva o fragmento do hub para app/, preservando-o", () => {
    expect(
      hubDeepLinkTarget(
        "#hub=192.168.0.5:7777&token=ABCDEF",
        "https://luizfer1.github.io/homefinance/#hub=192.168.0.5:7777&token=ABCDEF",
      ),
    ).toBe("https://luizfer1.github.io/homefinance/app/#hub=192.168.0.5:7777&token=ABCDEF");
    expect(hubDeepLinkTarget("#hub=x", "http://localhost:5173/?a=1#hub=x")).toBe(
      "http://localhost:5173/app/#hub=x",
    );
  });

  it("qualquer outro hash fica onde está", () => {
    expect(hubDeepLinkTarget("", "https://luizfer1.github.io/homefinance/")).toBeNull();
    expect(
      hubDeepLinkTarget("#extrato", "https://luizfer1.github.io/homefinance/#extrato"),
    ).toBeNull();
  });
});
