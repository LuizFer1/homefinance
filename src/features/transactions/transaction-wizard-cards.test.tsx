import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../domain/model/category";
import type { PaymentMethod } from "../../domain/model/payment-method";
import { ALIVE } from "../../domain/model/row.fake";
import { TransactionWizard } from "./transaction-wizard";

afterEach(cleanup);

const CATEGORIAS: Category[] = [
  { id: "cat-1", name: "Mercado", icon: "utensils", color: "emerald", kind: "expense", ...ALIVE },
];

function cartao(over: Partial<PaymentMethod> & { id: string }): PaymentMethod {
  return {
    name: "Nubank",
    icon: "credit-card",
    color: "violet",
    kind: "credit",
    ...ALIVE,
    ...over,
  };
}

const CARTOES: PaymentMethod[] = [
  cartao({ id: "pm-nu", name: "Nubank", bank: "Nubank", closingDay: 5, dueDay: 12 }),
  cartao({
    id: "pm-itau",
    name: "Itaú Platinum",
    color: "orange",
    bank: "Itaú",
    closingDay: 20,
    dueDay: 28,
  }),
  cartao({ id: "pm-velho", name: "Cartão antigo", color: "slate" }),
  cartao({ id: "pm-pix", name: "Pix", kind: "pix" }),
];

function montar() {
  const onSubmit = vi.fn();
  render(
    <TransactionWizard
      editing={null}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      today="2026-08-08"
      categories={CATEGORIAS}
      paymentMethods={CARTOES}
    />,
  );
  return { onSubmit };
}

function ateOPagamento() {
  fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Padaria" } });
  fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "10,00" } });
  for (let i = 0; i < 6 && screen.queryByRole("button", { name: "Continuar" }); i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  }
}

describe("wizard de lançamento: cartões", () => {
  it("lista cada cartão com a linha de apoio do ciclo da fatura", () => {
    montar();
    ateOPagamento();

    expect(
      screen.getByRole("radio", { name: /Nubank\s*Fecha dia 5 · vence dia 12/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("radio", { name: /Itaú Platinum\s*Itaú · Fecha dia 20 · vence dia 28/ }),
    ).toBeDefined();
    // Cartão por completar avisa em vez de calar; as outras formas não têm detalhe.
    expect(
      screen.getByRole("radio", { name: /Cartão antigo\s*Sem dados do cartão/ }),
    ).toBeDefined();
    expect(screen.getByRole("radio", { name: "Pix" })).toBeDefined();
  });

  it("grava o id do cartão escolhido e o cashback continua liberado pelo tipo", () => {
    const { onSubmit } = montar();
    ateOPagamento();

    fireEvent.click(screen.getByRole("radio", { name: /^Itaú Platinum/ }));
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /adicionar|salvar/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethodId: "pm-itau" }),
      null,
    );
  });

  it("Pix não libera cashback", () => {
    montar();
    ateOPagamento();

    fireEvent.click(screen.getByRole("radio", { name: "Pix" }));

    expect(screen.queryByLabelText(/cashback/i)).toBeNull();
  });
});
