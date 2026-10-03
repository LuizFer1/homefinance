import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Reserve } from "../../domain/model/reserve";
import { movement, reserve, stateOf } from "../../domain/reserves/fixtures.fake";
import { HOLD_MS } from "../ui/hold-button";
import { WithdrawSheet, type WithdrawSheetProps } from "./withdraw-sheet";

afterEach(cleanup);

const EMERGENCY_ID = "01J9F3K2M7QX8YB4TVWZ0DCEH1";

const EMERGENCY: Reserve = reserve(EMERGENCY_ID, {
  kind: "emergency",
  name: "Reserva de emergência",
  icon: "lifebuoy",
  multiple: 6,
  essentialOverrideMinor: 395_000,
});

const WITHDRAWAL = movement("w1", EMERGENCY_ID, -64_000, "2026-08-18", {
  description: "Conserto da geladeira",
  reason: "home",
});

// Saldo da reserva: R$ 15.420,00 (já descontada a retirada de R$ 640,00).
const STATE = stateOf({
  reserves: [EMERGENCY],
  movements: [movement("m1", EMERGENCY_ID, 1_606_000, "2026-05-10"), WITHDRAWAL],
});

function setup(extra: Partial<WithdrawSheetProps> = {}) {
  const props: WithdrawSheetProps = {
    state: STATE,
    reserve: EMERGENCY,
    today: "2026-09-20",
    editing: null,
    onSubmit: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...extra,
  };
  render(<WithdrawSheet {...props} />);
  return props;
}

const amount = () => screen.getByLabelText("Valor") as HTMLInputElement;
const withdraw = () => screen.getByRole("button", { name: /Retirar R\$/ }) as HTMLButtonElement;

describe("WithdrawSheet", () => {
  it("sem motivo o botão fica desativado; com motivo retira", () => {
    const { onSubmit } = setup();
    fireEvent.input(amount(), { target: { value: "38000" } });
    expect(withdraw().disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Carro" }));
    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Troca de pneu" } });
    expect(screen.getByText("Cobre 3,8 meses")).toBeDefined();
    expect(screen.getByText(/volta R\$\s?380 ao saldo de setembro/)).toBeDefined();
    fireEvent.click(withdraw());
    expect(onSubmit).toHaveBeenCalledWith({
      amountMinor: 38_000,
      description: "Troca de pneu",
      occurredOn: "2026-09-20",
      reason: "car",
    });
  });

  it("descrição vazia vai como null", () => {
    const { onSubmit } = setup();
    fireEvent.input(amount(), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("radio", { name: "Saúde" }));
    fireEvent.click(withdraw());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: null, reason: "health" }),
    );
  });

  it("acima do saldo da reserva: erro e botão desativado", () => {
    setup();
    fireEvent.input(amount(), { target: { value: "9999999" } });
    fireEvent.click(screen.getByRole("radio", { name: "Carro" }));
    expect(screen.getByText("Maior que o saldo da reserva")).toBeDefined();
    expect(withdraw().disabled).toBe(true);
  });

  it("em edição vem preenchido, soma a retirada original ao disponível e permite excluir", () => {
    const { onSubmit, onDelete } = setup({ editing: WITHDRAWAL });
    expect(screen.getByRole("heading", { name: "Editar retirada" })).toBeDefined();
    expect(amount().value).toBe("640,00");
    expect((screen.getByRole("radio", { name: "Casa" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe(
      "Conserto da geladeira",
    );

    // Disponível = 15.420 + 640 = 16.060: 16.060,00 passa e 16.060,01 não.
    fireEvent.input(amount(), { target: { value: "1606000" } });
    expect(withdraw().disabled).toBe(false);
    fireEvent.input(amount(), { target: { value: "1606001" } });
    expect(withdraw().disabled).toBe(true);

    fireEvent.input(amount(), { target: { value: "70000" } });
    fireEvent.click(withdraw());
    expect(onSubmit).toHaveBeenCalledWith({
      amountMinor: 70_000,
      description: "Conserto da geladeira",
      occurredOn: "2026-08-18",
      reason: "home",
    });

    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByRole("button", { name: /segure para excluir/i }));
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    vi.useRealTimers();
    expect(onDelete).toHaveBeenCalled();
  });
});
