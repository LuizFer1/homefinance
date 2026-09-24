import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetSection } from "./reset-section";

afterEach(cleanup);

function digitar(valor: string) {
  fireEvent.input(screen.getByLabelText(/digite apagar/i), { target: { value: valor } });
}

function botao() {
  return screen.getByRole("button", { name: /resetar conta/i });
}

describe("ResetSection", () => {
  it("o botao nasce bloqueado", () => {
    render(<ResetSection onReset={vi.fn()} />);

    expect(botao().hasAttribute("disabled")).toBe(true);
  });

  it("nao libera com o texto em caixa errada nem parcial", () => {
    // Comparacao exata, sem trim nem toUpperCase: o ponto e a deliberacao, nao
    // a conveniencia.
    render(<ResetSection onReset={vi.fn()} />);

    digitar("apagar");
    expect(botao().hasAttribute("disabled")).toBe(true);

    digitar("APAGA");
    expect(botao().hasAttribute("disabled")).toBe(true);

    digitar(" APAGAR ");
    expect(botao().hasAttribute("disabled")).toBe(true);
  });

  it("libera e dispara com o texto exato", () => {
    const onReset = vi.fn();
    render(<ResetSection onReset={onReset} />);

    digitar("APAGAR");
    expect(botao().hasAttribute("disabled")).toBe(false);

    fireEvent.click(botao());

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("volta a bloquear se o texto for corrigido para algo errado", () => {
    render(<ResetSection onReset={vi.fn()} />);

    digitar("APAGAR");
    digitar("APAGARR");

    expect(botao().hasAttribute("disabled")).toBe(true);
  });

  it("avisa que nao ha como desfazer antes de qualquer clique", () => {
    render(<ResetSection onReset={vi.fn()} />);

    expect(screen.getByText(/não há como desfazer/i)).toBeDefined();
  });
});
