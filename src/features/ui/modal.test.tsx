import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./modal";

afterEach(cleanup);

describe("Modal", () => {
  it("abre e fecha conforme a prop", () => {
    const { rerender } = render(
      <Modal open={false} title="Novo" onClose={vi.fn()}>
        <p>conteudo</p>
      </Modal>,
    );
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    rerender(
      <Modal open title="Novo" onClose={vi.fn()}>
        <p>conteudo</p>
      </Modal>,
    );
    expect(dialog.open).toBe(true);
  });

  it("avisa quem fecha pelo caminho nativo", () => {
    // Esc fecha o dialog sem passar por nenhum handler nosso. Sem escutar
    // `close`, o estado externo continuaria "aberto" e o modal nao reabriria.
    const onClose = vi.fn();
    render(
      <Modal open title="Novo" onClose={onClose}>
        <p>conteudo</p>
      </Modal>,
    );

    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    // `close` e o evento que o Esc dispara. Emiti-lo direto e mais fiel que
    // simular a tecla, que o happy-dom nao encaminha para o dialog.
    fireEvent(dialog, new Event("close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("fecha ao clicar no backdrop, mas nao no conteudo", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Novo" onClose={onClose}>
        <p>conteudo</p>
      </Modal>,
    );

    fireEvent.click(screen.getByText("conteudo"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector("dialog") as HTMLDialogElement);
    expect(onClose).toHaveBeenCalled();
  });

  it("carrega rotulo acessivel", () => {
    render(
      <Modal open title="Novo lancamento" onClose={vi.fn()}>
        <p>conteudo</p>
      </Modal>,
    );

    expect(screen.getByLabelText("Novo lancamento")).toBeDefined();
  });
});
