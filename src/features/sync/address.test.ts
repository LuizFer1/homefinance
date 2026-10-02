import { describe, expect, it } from "vitest";
import {
  addressProblem,
  caGuideUrl,
  hubBaseUrl,
  normalizeAddress,
  normalizeToken,
} from "./address";

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

  it("aceita só localhost, loopback e as faixas privadas, como a CA do hub", () => {
    expect(normalizeAddress("127.0.0.1")).toBe("127.0.0.1:7777");
    expect(normalizeAddress("127.255.0.9:8000")).toBe("127.255.0.9:8000");
    expect(normalizeAddress("10.0.0.2")).toBe("10.0.0.2:7777");
    expect(normalizeAddress("10.255.255.255")).toBe("10.255.255.255:7777");
    expect(normalizeAddress("172.16.0.1")).toBe("172.16.0.1:7777");
    expect(normalizeAddress("172.31.255.254")).toBe("172.31.255.254:7777");
    expect(normalizeAddress("192.168.255.1")).toBe("192.168.255.1:7777");
  });

  it("recusa hostname público e IP fora das faixas, inclusive nas bordas", () => {
    expect(normalizeAddress("evil.example:443")).toBeNull();
    expect(normalizeAddress("https://evil.example/")).toBeNull();
    expect(normalizeAddress("hub.local")).toBeNull();
    expect(normalizeAddress("8.8.8.8")).toBeNull();
    expect(normalizeAddress("172.15.255.255")).toBeNull();
    expect(normalizeAddress("172.32.0.1")).toBeNull();
    expect(normalizeAddress("192.169.0.1")).toBeNull();
    expect(normalizeAddress("11.0.0.1")).toBeNull();
    expect(normalizeAddress("192.168.0.256")).toBeNull();
  });
});

describe("addressProblem", () => {
  it("explica em português por que o endereço foi recusado", () => {
    expect(addressProblem("192.168.0.5")).toBeNull();
    expect(addressProblem("evil.example:443")).toContain("rede de casa");
    expect(addressProblem("172.32.0.1")).toContain("rede de casa");
    expect(addressProblem("a:b:c")).toContain("192.168.0.5:7777");
    expect(addressProblem("")).toContain("192.168.0.5:7777");
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
