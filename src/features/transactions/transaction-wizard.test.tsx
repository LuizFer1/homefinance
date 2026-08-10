import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CategoryRecord,
  PaymentMethodRecord,
  TransactionRecord,
} from "../../domain/projections/apply";
import { TransactionWizard } from "./transaction-wizard";

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
  userId: null,
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

function montar(over: Partial<Parameters<typeof TransactionWizard>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <TransactionWizard
      editing={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      today="2026-08-08"
      {...LISTAS}
      {...over}
    />,
  );
  return { onSubmit, onCancel };
}

function preencherDados(descricao = "Padaria", valor = "10,00") {
  fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: descricao } });
  fireEvent.input(screen.getByLabelText("Valor"), { target: { value: valor } });
}

function continuar() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

function escolher(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function enviar() {
  fireEvent.click(screen.getByRole("button", { name: /adicionar|salvar/i }));
}

/** Etapa 1 preenchida, depois avança até a etapa de pagamento. */
function ateOPagamento(descricao = "Padaria", valor = "10,00") {
  preencherDados(descricao, valor);
  continuar();
  continuar();
}

describe("navegação entre etapas", () => {
  it("começa nos dados da compra", () => {
    montar();

    expect(screen.getByLabelText("Descrição")).toBeDefined();
    expect(screen.queryByLabelText(/^categoria$/i)).toBeNull();
  });

  it("avança e volta preservando o que foi digitado", () => {
    // O rascunho vive na wizard, não nas etapas. Se cada etapa guardasse o
    // próprio estado, voltar apagaria o que o usuário digitou.
    montar();
    preencherDados("Farmacia", "25,50");

    continuar();
    escolher(/categoria/i, "cat-1");
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));

    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("Farmacia");
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("25,50");
  });

  it("bloqueia avanço com descrição vazia, mostrando o erro na etapa", () => {
    // Validar só no fim mostraria o problema a duas telas de onde ele nasceu.
    montar();

    continuar();

    expect(screen.getByRole("alert").textContent).toBe("Informe uma descrição.");
    expect(screen.getByLabelText("Descrição")).toBeDefined();
  });

  it("bloqueia avanço com valor zero ou inválido", () => {
    montar();
    preencherDados("Padaria", "0");

    continuar();

    expect(screen.getByRole("alert").textContent).toBe("Informe um valor maior que zero.");
  });

  it("o indicador não deixa pular para pagamento antes dos dados válidos", () => {
    montar();

    expect(screen.getByRole("button", { name: /Pagamento/ })).toHaveProperty("disabled", true);

    preencherDados();

    expect(screen.getByRole("button", { name: /Pagamento/ })).toHaveProperty("disabled", false);
  });

  it("o indicador pula direto para a etapa escolhida", () => {
    montar();
    preencherDados();

    fireEvent.click(screen.getByRole("button", { name: /Pagamento/ }));

    expect(screen.getByLabelText(/forma de pagamento/i)).toBeDefined();
  });

  it("só a última etapa oferece o botão de salvar", () => {
    montar();
    preencherDados();
    expect(screen.queryByRole("button", { name: "Adicionar" })).toBeNull();

    continuar();
    expect(screen.queryByRole("button", { name: "Adicionar" })).toBeNull();

    continuar();
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeDefined();
  });

  it("fechar não emite nada", () => {
    const { onSubmit, onCancel } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("emissão do rascunho", () => {
  it("emite um draft com o valor convertido para centavos", () => {
    const { onSubmit } = montar();
    ateOPagamento("Padaria", "12,34");

    enviar();

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

  it("categoria e forma de pagamento são opcionais", () => {
    const { onSubmit } = montar();
    ateOPagamento();

    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null, paymentMethodId: null }),
    );
  });

  it("carrega as escolhas das etapas 2 e 3", () => {
    const { onSubmit } = montar();
    preencherDados();
    continuar();
    escolher(/categoria/i, "cat-1");
    continuar();
    escolher(/forma de pagamento/i, "pm-pix");

    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "cat-1", paymentMethodId: "pm-pix" }),
    );
  });

  it("preenche os campos ao editar e abre na primeira etapa", () => {
    montar({ editing: { ...RECORD, categoryId: "cat-1", paymentMethodId: "pm-pix" } });

    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("Mercado");
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("123,45");

    fireEvent.click(screen.getByRole("button", { name: /Categoria/ }));
    expect((screen.getByLabelText(/categoria/i) as HTMLSelectElement).value).toBe("cat-1");
  });
});

describe("cashback condicionado", () => {
  it("mostra o campo para credito e para debito", () => {
    montar();
    ateOPagamento();

    escolher(/forma de pagamento/i, "pm-credito");
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();

    escolher(/forma de pagamento/i, "pm-debito");
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();
  });

  it("esconde o campo para dinheiro, pix e outros", () => {
    montar();
    ateOPagamento();

    for (const id of ["pm-dinheiro", "pm-pix", "pm-outro"]) {
      escolher(/forma de pagamento/i, id);
      expect(screen.queryByLabelText(/cashback/i)).toBeNull();
    }
  });

  it("esconde o campo sem forma de pagamento escolhida", () => {
    montar();
    ateOPagamento();

    expect(screen.queryByLabelText(/cashback/i)).toBeNull();
  });

  it("esconde o campo em receita, mesmo com cartão selecionado", () => {
    // So despesa pode gerar retorno.
    montar();
    ateOPagamento();
    escolher(/forma de pagamento/i, "pm-credito");
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Dados/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Receita" }));
    fireEvent.click(screen.getByRole("button", { name: /Pagamento/ }));

    expect(screen.queryByLabelText(/cashback/i)).toBeNull();
  });
});

describe("limpeza do cashback", () => {
  const COM_CASHBACK: TransactionRecord = {
    ...RECORD,
    paymentMethodId: "pm-credito",
    cashbackMinor: 500,
  };

  it("trocar para dinheiro emite cashbackMinor null", () => {
    // O teste mais importante da fatia 3, preservado aqui. Esconder sem limpar
    // deixaria dado sujo permanente: invisivel na tela, presente no export,
    // imortal no log append-only.
    const { onSubmit } = montar({ editing: COM_CASHBACK });
    fireEvent.click(screen.getByRole("button", { name: /Pagamento/ }));
    expect((screen.getByLabelText(/cashback/i) as HTMLInputElement).value).toBe("5,00");

    escolher(/forma de pagamento/i, "pm-dinheiro");
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethodId: "pm-dinheiro", cashbackMinor: null }),
    );
  });

  it("trocar de despesa para receita numa etapa anterior tambem limpa", () => {
    // A prova de que o submit unico preserva a regra. O tipo esta na etapa 1 e a
    // forma de pagamento na 3: com submit por etapa, este caminho deixaria o
    // cashback pendurado.
    const { onSubmit } = montar({ editing: COM_CASHBACK });

    fireEvent.click(screen.getByRole("radio", { name: "Receita" }));
    fireEvent.click(screen.getByRole("button", { name: /Pagamento/ }));
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cashbackMinor: null }));
  });

  it("manter o cartão preserva o cashback digitado", () => {
    const { onSubmit } = montar({ editing: COM_CASHBACK });
    fireEvent.click(screen.getByRole("button", { name: /Pagamento/ }));

    fireEvent.input(screen.getByLabelText(/cashback/i), { target: { value: "7,50" } });
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cashbackMinor: 750 }));
  });
});

describe("referências e listas vazias", () => {
  it("mantém a seleção de uma categoria apagada, com rótulo neutro", () => {
    montar({ editing: { ...RECORD, categoryId: "cat-apagada" } });

    fireEvent.click(screen.getByRole("button", { name: /Categoria/ }));

    const select = screen.getByLabelText(/categoria/i) as HTMLSelectElement;
    expect(select.value).toBe("cat-apagada");
    expect(screen.getByText("Categoria removida")).toBeDefined();
  });

  it("sem nada cadastrado mostra atalho em vez de dropdown vazio", () => {
    montar({ categories: [], paymentMethods: [] });
    preencherDados();
    continuar();

    expect(screen.queryByLabelText(/^categoria$/i)).toBeNull();
    expect(screen.getByText(/Cadastre em Categorias/)).toBeDefined();
  });
});
