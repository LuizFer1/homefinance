import { describe, expect, it, vi } from "vitest";
import { createInstallFlow, type InstallPromptEvent } from "./install";

function promptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  } as unknown as InstallPromptEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
  };
}

describe("createInstallFlow", () => {
  it("sem evento capturado, pede instrucoes manuais", async () => {
    const flow = createInstallFlow();
    expect(flow.canPrompt()).toBe(false);
    expect(await flow.install()).toBe("manual");
  });

  it("segura o mini-infobar do navegador e guarda o evento", () => {
    const flow = createInstallFlow();
    const e = promptEvent();
    flow.capture(e);
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(flow.canPrompt()).toBe(true);
  });

  it("com evento, abre o prompt e devolve a escolha", async () => {
    const flow = createInstallFlow();
    const e = promptEvent("dismissed");
    flow.capture(e);
    expect(await flow.install()).toBe("dismissed");
    expect(e.prompt).toHaveBeenCalledOnce();
  });

  it("o evento so vale uma vez: a segunda tentativa cai no manual", async () => {
    const flow = createInstallFlow();
    const e = promptEvent();
    flow.capture(e);
    await flow.install();
    expect(await flow.install()).toBe("manual");
    expect(e.prompt).toHaveBeenCalledOnce();
  });

  it("prompt que lanca cai no manual em vez de travar o botao", async () => {
    const flow = createInstallFlow();
    const e = promptEvent();
    e.prompt.mockRejectedValueOnce(new Error("NotAllowedError"));
    flow.capture(e);
    expect(await flow.install()).toBe("manual");
  });
});
