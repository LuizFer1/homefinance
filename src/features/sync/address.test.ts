import { describe, expect, it } from "vitest";
import { caGuideUrl, hubBaseUrl, normalizeAddress, normalizeToken } from "./address";

describe("normalizeAddress", () => {
  it("aceita ip, ip:porta e url, com porta padrão 7777", () => {
    expect(normalizeAddress("192.168.0.5")).toBe("192.168.0.5:7777");
    expect(normalizeAddress(" 192.168.0.5:7777 ")).toBe("192.168.0.5:7777");
    expect(normalizeAddress("https://192.168.0.5:7777/")).toBe("192.168.0.5:7777");
    expect(normalizeAddress("HTTPS://192.168.0.5:8443/v1/info")).toBe("192.168.0.5:8443");
    expect(normalizeAddress("localhost")).toBe("localhost:7777");
  });

  it("recusa o que não é host:porta", () => {
    expect(normalizeAddress("")).toBeNull();
    expect(normalizeAddress("192.168.0.5:abc")).toBeNull();
    expect(normalizeAddress("192.168.0.5:0")).toBeNull();
    expect(normalizeAddress("a:b:c")).toBeNull();
    expect(normalizeAddress("sem espaço aqui")).toBeNull();
  });
});

describe("normalizeToken", () => {
  it("ignora hífen, espaço e caixa", () => {
    expect(normalizeToken("abc-def")).toBe("ABCDEF");
    expect(normalizeToken(" ABC DEF ")).toBe("ABCDEF");
    expect(normalizeToken("ABCDEF")).toBe("ABCDEF");
  });

  it("exige 6 caracteres Crockford", () => {
    expect(normalizeToken("ABCDE")).toBeNull();
    expect(normalizeToken("ABCDEFG")).toBeNull();
    expect(normalizeToken("ABCDEI")).toBeNull();
    expect(normalizeToken("")).toBeNull();
  });
});

describe("urls", () => {
  it("api em https na porta do hub; guia da CA em http na 7778", () => {
    expect(hubBaseUrl("192.168.0.5:7777")).toBe("https://192.168.0.5:7777");
    expect(caGuideUrl("192.168.0.5:7777")).toBe("http://192.168.0.5:7778/");
  });
});
