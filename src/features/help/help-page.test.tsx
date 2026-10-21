import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pendingHelp } from "./deep-link";
import { HelpPage } from "./help-page";

afterEach(() => {
  cleanup();
  pendingHelp.value = null;
});

describe("HelpPage", () => {
  it("lista os temas e abre uma resposta ao tocar", () => {
    render(<HelpPage onBack={() => {}} />);
    expect(screen.getByRole("heading", { name: "Privacidade" })).toBeTruthy();
    const question = screen.getByRole("button", { name: /Onde ficam meus dados/ });
    expect(question.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(question);
    expect(question.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Seus dados ficam no aparelho/)).toBeTruthy();
  });

  it("busca sem acento pelo texto da resposta", () => {
    render(<HelpPage onBack={() => {}} />);
    fireEvent.input(screen.getByLabelText("Buscar na ajuda"), { target: { value: "ORCAMENTO" } });
    expect(screen.getByRole("button", { name: /quanto posso gastar/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Onde ficam meus dados/ })).toBeNull();
  });

  it("avisa quando nada casa", () => {
    render(<HelpPage onBack={() => {}} />);
    fireEvent.input(screen.getByLabelText("Buscar na ajuda"), { target: { value: "zzzxyz" } });
    expect(screen.getByText(/Nenhuma pergunta encontrada/)).toBeTruthy();
  });

  it("abre direto a pergunta pedida por link e zera o pedido", () => {
    pendingHelp.value = "sync-pair";
    render(<HelpPage onBack={() => {}} />);
    const question = screen.getByRole("button", { name: /Como pareio/ });
    expect(question.getAttribute("aria-expanded")).toBe("true");
    expect(pendingHelp.value).toBeNull();
  });

  it("copia o link da pergunta", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    pendingHelp.value = "privacy-hide";
    render(<HelpPage onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Copiar link/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("#ajuda=privacy-hide"));
    expect(await screen.findByText("Link copiado")).toBeTruthy();
  });

  it("o voltar chama onBack", () => {
    const onBack = vi.fn();
    render(<HelpPage onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar para configurações" }));
    expect(onBack).toHaveBeenCalled();
  });
});
