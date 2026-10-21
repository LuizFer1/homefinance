import { describe, expect, it, vi } from "vitest";
import { consumeHelpLink, helpLink, parseHelpLink } from "./deep-link";

describe("link da ajuda", () => {
  it("ida e volta", () => {
    expect(parseHelpLink(helpLink("sync-pair"))).toBe("sync-pair");
  });

  it("id desconhecido ou outro fragmento não é link de pergunta", () => {
    expect(parseHelpLink("#ajuda=nao-existe")).toBeNull();
    expect(parseHelpLink("#hub=1.2.3.4:7777&token=x")).toBeNull();
    expect(parseHelpLink("#ajuda=%E0%A4%A")).toBeNull();
  });

  it("consome e limpa; id desconhecido abre a Ajuda inteira", () => {
    const replaceState = vi.fn();
    const where = { pathname: "/homefinance/app/", search: "?a=1" };
    expect(consumeHelpLink({ ...where, hash: "#ajuda=privacy-local" }, { replaceState })).toBe(
      "privacy-local",
    );
    expect(consumeHelpLink({ ...where, hash: "#ajuda=zzz" }, { replaceState })).toBe("");
    expect(consumeHelpLink({ ...where, hash: "" }, { replaceState })).toBeNull();
    expect(replaceState).toHaveBeenCalledTimes(2);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/homefinance/app/?a=1");
  });
});
