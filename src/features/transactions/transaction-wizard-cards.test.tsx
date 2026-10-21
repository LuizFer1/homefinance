import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../domain/model/category";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
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

describe("wizard de lançamento: cartão identificado só pela cor", () => {
  it("cartão de crédito aparece com marcador de cor e sem tile de ícone", () => {
    montar();
    ateOPagamento();

    const nubank = screen.getByRole("radio", { name: /^Nubank/ }).closest("label") as HTMLElement;
    expect(nubank.querySelector("[data-testid='card-mark']")).not.toBeNull();
    expect(nubank.querySelector("[data-testid='icon-credit-card']")).toBeNull();

    // As outras formas seguem com o tile de ícone.
    const pix = screen.getByRole("radio", { name: "Pix" }).closest("label") as HTMLElement;
    expect(pix.querySelector("[data-testid='card-mark']")).toBeNull();
  });
});

describe("wizard de lançamento: cadastro rápido de cartão", () => {
  function comCadastro(onCreate: (draft: PaymentMethodDraft) => Promise<PaymentMethod>) {
    const onSubmit = vi.fn();
    function Host() {
      const [lista, setLista] = useState<PaymentMethod[]>([CARTOES[3] as PaymentMethod]);
      return (
        <TransactionWizard
          editing={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          today="2026-08-08"
          categories={CATEGORIAS}
          paymentMethods={lista}
          onCreateCard={async (draft) => {
            const criado = await onCreate(draft);
            setLista((atual) => [...atual, criado]);
            return criado;
          }}
        />
      );
    }
    render(<Host />);
    return { onSubmit };
  }

  const criar = async (draft: PaymentMethodDraft) =>
    ({ id: "pm-novo", ...draft, ...ALIVE }) as PaymentMethod;

  function cadastrar() {
    fireEvent.click(screen.getByRole("button", { name: "Novo cartão de crédito" }));
    fireEvent.input(screen.getByLabelText("Banco"), { target: { value: "Inter" } });
    fireEvent.input(screen.getByLabelText("Fechamento"), { target: { value: "10" } });
    fireEvent.input(screen.getByLabelText("Vencimento"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar cartão" }));
  }

  it("salva o cartão e já o deixa selecionado, com o rascunho do lançamento intacto", async () => {
    const onCreate = vi.fn(criar);
    const { onSubmit } = comCadastro(onCreate);
    ateOPagamento();

    cadastrar();

    await waitFor(() =>
      expect((screen.getByRole("radio", { name: /^Inter/ }) as HTMLInputElement).checked).toBe(
        true,
      ),
    );
    expect(onCreate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /adicionar|salvar/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethodId: "pm-novo", description: "Padaria" }),
      null,
    );
  });

  it("cancelar volta ao pagamento sem criar nada", () => {
    const onCreate = vi.fn(criar);
    comCadastro(onCreate);
    ateOPagamento();

    fireEvent.click(screen.getByRole("button", { name: "Novo cartão de crédito" }));
    fireEvent.input(screen.getByLabelText("Banco"), { target: { value: "Inter" } });
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Pix" })).toBeDefined();
    expect(screen.queryByRole("radio", { name: /^Inter/ })).toBeNull();
  });
});
