import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepIndicator } from "./step-indicator";

afterEach(cleanup);

const STEPS = ["Dados", "Categoria", "Pagamento"] as const;

describe("StepIndicator", () => {
  it("marca a etapa atual para leitores de tela", () => {
    render(<StepIndicator steps={STEPS} current={1} maxReachable={2} onGo={vi.fn()} />);

    // `getAttribute` e nao `ariaCurrent`: o happy-dom nem sempre reflete a
    // propriedade, mas o atributo e o que o leitor de tela le.
    expect(screen.getByRole("button", { name: /Categoria/ }).getAttribute("aria-current")).toBe(
      "step",
    );
  });

  it("permite voltar para etapa ja alcancada", () => {
    const onGo = vi.fn();
    render(<StepIndicator steps={STEPS} current={2} maxReachable={2} onGo={onGo} />);

    fireEvent.click(screen.getByRole("button", { name: /Dados/ }));

    expect(onGo).toHaveBeenCalledWith(0);
  });

  it("bloqueia etapa ainda nao alcancavel", () => {
    // Enquanto os dados da compra nao sao validos, pular para pagamento
    // produziria um lancamento sem descricao nem valor.
    const onGo = vi.fn();
    render(<StepIndicator steps={STEPS} current={0} maxReachable={0} onGo={onGo} />);

    const pagamento = screen.getByRole("button", { name: /Pagamento/ });
    expect(pagamento).toHaveProperty("disabled", true);

    fireEvent.click(pagamento);
    expect(onGo).not.toHaveBeenCalled();
  });
});
