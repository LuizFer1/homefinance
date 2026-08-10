import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CategoryRecord,
  PaymentMethodRecord,
  TransactionRecord,
} from "../../domain/projections/apply";
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

const CATEGORIAS: CategoryRecord[] = [
  {
    id: "cat-1",
    name: "Alimentacao",
    icon: "utensils",
    color: "emerald",
    deleted: false,
    materialized: true,
    fieldHlc: {},
  },
];

function metodo(over: Partial<PaymentMethodRecord> & { id: string }): PaymentMethodRecord {
  return {
    name: "Nubank",
    icon: "credit-card",
    color: "violet",
    kind: "credit",
    deleted: false,
    materialized: true,
    fieldHlc: {},
    ...over,
  };
}

const METODOS: PaymentMethodRecord[] = [
  metodo({ id: "pm-credito", name: "Cartao credito", kind: "credit" }),
  metodo({ id: "pm-debito", name: "Cartao debito", kind: "debit" }),
  metodo({ id: "pm-dinheiro", name: "Dinheiro", kind: "cash" }),
  metodo({ id: "pm-pix", name: "Pix", kind: "pix" }),
  metodo({ id: "pm-outro", name: "Vale", kind: "other" }),
];

const LISTAS = { categories: CATEGORIAS, paymentMethods: METODOS };

function escolher(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function enviar() {
  fireEvent.click(screen.getByRole("button", { name: /adicionar|salvar/i }));
}

describe("TransactionForm", () => {
  it("emite um draft com o valor convertido para centavos", () => {
    const onSubmit = vi.fn();
    render(
      <TransactionForm
        editing={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
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
      <TransactionForm
        editing={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
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
      <TransactionForm
        editing={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
    );

    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "10,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("descrição");
  });

  it("limpa os campos depois de adicionar", () => {
    render(
      <TransactionForm
        editing={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
    );

    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Padaria" } });
    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "12,34" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("");
  });

  it("preenche os campos ao editar", () => {
    render(
      <TransactionForm
        editing={RECORD}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
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
        {...LISTAS}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
  });
});

describe("cashback condicionado", () => {
  function montar() {
    render(
      <TransactionForm
        editing={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
    );
  }

  it("mostra o campo para credito e para debito", () => {
    montar();

    escolher(/forma de pagamento/i, "pm-credito");
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();

    escolher(/forma de pagamento/i, "pm-debito");
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();
  });

  it("esconde o campo para dinheiro, pix e outros", () => {
    montar();

    for (const id of ["pm-dinheiro", "pm-pix", "pm-outro"]) {
      escolher(/forma de pagamento/i, id);
      expect(screen.queryByLabelText(/cashback/i)).toBeNull();
    }
  });

  it("esconde o campo sem forma de pagamento escolhida", () => {
    montar();

    expect(screen.queryByLabelText(/cashback/i)).toBeNull();
  });

  it("esconde o campo em receita, mesmo com cartao selecionado", () => {
    // So despesa pode gerar retorno.
    montar();
    escolher(/forma de pagamento/i, "pm-credito");
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: "Receita" }));

    expect(screen.queryByLabelText(/cashback/i)).toBeNull();
  });
});

describe("limpeza do cashback", () => {
  const COM_CASHBACK: TransactionRecord = {
    ...RECORD,
    paymentMethodId: "pm-credito",
    cashbackMinor: 500,
  };

  function montarEdicao(onSubmit: () => void) {
    render(
      <TransactionForm
        editing={COM_CASHBACK}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
    );
  }

  it("trocar para dinheiro emite cashbackMinor null", () => {
    // O teste mais importante da fatia. Esconder sem limpar deixaria dado sujo
    // permanente: invisivel na tela, presente no export, imortal no log.
    const onSubmit = vi.fn();
    montarEdicao(onSubmit);
    expect((screen.getByLabelText(/cashback/i) as HTMLInputElement).value).toBe("5,00");

    escolher(/forma de pagamento/i, "pm-dinheiro");
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethodId: "pm-dinheiro", cashbackMinor: null }),
    );
  });

  it("trocar de despesa para receita tambem limpa o cashback", () => {
    // A regra depende dos dois eixos, entao os dois eixos limpam. Nao esta
    // literal no spec, mas cai direto de offersCashback depender do kind da
    // transacao — sem isto, despesa -> receita deixa o mesmo dado sujo.
    const onSubmit = vi.fn();
    montarEdicao(onSubmit);

    fireEvent.click(screen.getByRole("radio", { name: "Receita" }));
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cashbackMinor: null }));
  });

  it("manter o cartao preserva o cashback digitado", () => {
    const onSubmit = vi.fn();
    montarEdicao(onSubmit);

    fireEvent.input(screen.getByLabelText(/cashback/i), { target: { value: "7,50" } });
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cashbackMinor: 750 }));
  });
});

describe("seletores de categoria e forma de pagamento", () => {
  it("sao opcionais: submeter sem escolher emite null nos dois", () => {
    const onSubmit = vi.fn();
    render(
      <TransactionForm
        editing={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
    );

    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Padaria" } });
    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "10,00" } });
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null, paymentMethodId: null }),
    );
  });

  it("preenche a selecao do registro em edicao", () => {
    render(
      <TransactionForm
        editing={{ ...RECORD, categoryId: "cat-1", paymentMethodId: "pm-pix" }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
    );

    expect((screen.getByLabelText(/categoria/i) as HTMLSelectElement).value).toBe("cat-1");
    expect((screen.getByLabelText(/forma de pagamento/i) as HTMLSelectElement).value).toBe(
      "pm-pix",
    );
  });

  it("mantem a selecao de uma categoria apagada, com rotulo neutro", () => {
    // Apagar nao cascateia: filtrar sem tratar este caso faria a selecao sumir
    // sozinha ao abrir a edicao de um lancamento antigo.
    render(
      <TransactionForm
        editing={{ ...RECORD, categoryId: "cat-apagada" }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        today="2026-08-08"
        {...LISTAS}
      />,
    );

    const select = screen.getByLabelText(/categoria/i) as HTMLSelectElement;
    expect(select.value).toBe("cat-apagada");
    expect(screen.getByText("Categoria removida")).toBeDefined();
  });

  it("sem nada cadastrado mostra atalho em vez de dropdown vazio", () => {
    render(
      <TransactionForm
        editing={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        today="2026-08-08"
        categories={[]}
        paymentMethods={[]}
      />,
    );

    expect(screen.queryByLabelText(/^categoria$/i)).toBeNull();
    expect(screen.getByText(/Cadastre em Categorias/)).toBeDefined();
  });
});
