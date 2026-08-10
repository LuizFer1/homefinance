import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "../../domain/projections/apply";
import { TransactionForm } from "./transaction-form";

afterEach(cleanup);

const RECORD: TransactionRecord = {
  id: "01J9F3K2M7QX8YB4TVWZ0DCEH2",
  kind: "expense",
  description: "Mercado",
  amountMinor: 12_345,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-08-07",
  deleted: false,
  materialized: true,
  fieldHlc: {},
};

describe("TransactionForm", () => {
  it("emite um draft com o valor convertido para centavos", () => {
    const onSubmit = vi.fn();
    render(
      <TransactionForm editing={null} onSubmit={onSubmit} onCancel={vi.fn()} today="2026-08-08" />,
    );

    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Padaria" } });
    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "12,34" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: "expense",
      description: "Padaria",
      amountMinor: 1234,
      currency: "BRL",
      categoryId: null,
      paymentMethodId: null,
      cashbackMinor: null,
      occurredOn: "2026-08-08",
    });
  });

  it("recusa valor inválido sem emitir nada", () => {
    const onSubmit = vi.fn();
    render(
      <TransactionForm editing={null} onSubmit={onSubmit} onCancel={vi.fn()} today="2026-08-08" />,
    );

    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Padaria" } });
    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("recusa descrição vazia sem emitir nada", () => {
    const onSubmit = vi.fn();
    render(
      <TransactionForm editing={null} onSubmit={onSubmit} onCancel={vi.fn()} today="2026-08-08" />,
    );

    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "10,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("descrição");
  });

  it("limpa os campos depois de adicionar", () => {
    render(
      <TransactionForm editing={null} onSubmit={vi.fn()} onCancel={vi.fn()} today="2026-08-08" />,
    );

    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Padaria" } });
    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "12,34" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("");
  });

  it("preenche os campos ao editar", () => {
    render(
      <TransactionForm editing={RECORD} onSubmit={vi.fn()} onCancel={vi.fn()} today="2026-08-08" />,
    );

    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("Mercado");
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("123,45");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDefined();
  });

  it("cancela a edição", () => {
    const onCancel = vi.fn();
    render(
      <TransactionForm
        editing={RECORD}
        onSubmit={vi.fn()}
        onCancel={onCancel}
        today="2026-08-08"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
