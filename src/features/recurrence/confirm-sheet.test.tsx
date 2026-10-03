import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALIVE } from "../../domain/model/row.fake";
import type { Transaction } from "../../domain/model/transaction";
import { ConfirmSheet } from "./confirm-sheet";

afterEach(cleanup);

const LUZ: Transaction = {
  ...ALIVE,
  id: "LUZ-OUT",
  kind: "expense",
  description: "Conta de luz",
  amountMinor: 20_000,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-10-10",
  userId: null,
  recurrenceId: "SERIE",
  occurrenceKey: "SERIE:2026-10",
  estimated: true,
};

function renderSheet() {
  const onConfirm = vi.fn();
  render(<ConfirmSheet record={LUZ} today="2026-10-20" onConfirm={onConfirm} onClose={vi.fn()} />);
  return onConfirm;
}

describe("ConfirmSheet", () => {
  it("vem preenchida com a estimativa e confirma sem mudar nada", () => {
    const onConfirm = renderSheet();

    expect(screen.getByText(/Conta de luz · out\/2026/)).toBeDefined();
    expect((screen.getByLabelText("Valor real") as HTMLInputElement).value).toBe("200,00");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onConfirm).toHaveBeenCalledWith({ amountMinor: 20_000, occurredOn: "2026-10-10" });
  });

  it("confirma com o valor digitado; vazio não confirma", () => {
    const onConfirm = renderSheet();
    const input = screen.getByLabelText("Valor real");

    fireEvent.input(input, { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.input(input, { target: { value: "32000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledWith({ amountMinor: 32_000, occurredOn: "2026-10-10" });
  });
});
