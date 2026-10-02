import { describe, expect, it, vi } from "vitest";
import { consumeHubDeepLink, parseHubDeepLink } from "./deep-link";

describe("parseHubDeepLink", () => {
  it("lê endereço e código do fragmento do QR", () => {
    expect(parseHubDeepLink("#hub=192.168.0.5:7777&token=abc-def")).toEqual({
      address: "192.168.0.5:7777",
      token: "ABCDEF",
    });
  });

  it("fragmento ausente, de outra coisa ou inválido é null", () => {
    expect(parseHubDeepLink("")).toBeNull();
    expect(parseHubDeepLink("#extrato")).toBeNull();
    expect(parseHubDeepLink("#hub=192.168.0.5:7777")).toBeNull();
    expect(parseHubDeepLink("#hub=&token=ABCDEF")).toBeNull();
    expect(parseHubDeepLink("#hub=192.168.0.5:7777&token=ABCDE")).toBeNull();
    // Um QR adulterado não pode apontar o app para fora da rede de casa.
    expect(parseHubDeepLink("#hub=evil.example:443&token=ABCDEF")).toBeNull();
  });
});

describe("consumeHubDeepLink", () => {
  it("devolve o link e limpa o hash da barra", () => {
    const replaceState = vi.fn();
    const link = consumeHubDeepLink(
      { hash: "#hub=192.168.0.5:7777&token=ABCDEF", pathname: "/homefinance/app/", search: "" },
      { replaceState },
    );
    expect(link).toEqual({ address: "192.168.0.5:7777", token: "ABCDEF" });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/homefinance/app/");
  });

  it("hash de hub inválido também é limpo; outros hashes ficam", () => {
    const replaceState = vi.fn();
    expect(
      consumeHubDeepLink({ hash: "#hub=x", pathname: "/app/", search: "?a=1" }, { replaceState }),
    ).toBeNull();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/app/?a=1");
    replaceState.mockClear();
    expect(
      consumeHubDeepLink({ hash: "#outro", pathname: "/app/", search: "" }, { replaceState }),
    ).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
