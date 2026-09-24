import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../domain/model/category";
import type { PaymentMethod } from "../../domain/model/payment-method";
import { ALIVE } from "../../domain/model/row.fake";
import type { Transaction } from "../../domain/model/transaction";
import { HOLD_MS } from "../ui/hold-button";
import { TransactionWizard } from "./transaction-wizard";

afterEach(cleanup);

const RECORD: Transaction = {
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
  recurrenceId: null,
  occurrenceKey: null,
  ...ALIVE,
};

const CATEGORIAS: Category[] = [
  {
    id: "cat-1",
    name: "Alimentacao",
    icon: "utensils",
    color: "emerald",
    kind: "expense",
    ...ALIVE,
  },
];

function metodo(over: Partial<PaymentMethod> & { id: string }): PaymentMethod {
  return {
    name: "Nubank",
    icon: "credit-card",
    color: "violet",
    kind: "credit",
    ...ALIVE,
    ...over,
  };
}

const METODOS: PaymentMethod[] = [
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

/** Escolhe uma opcao da grade pelo nome visivel do chip. */
function escolher(nome: RegExp | string) {
  fireEvent.click(screen.getByRole("radio", { name: nome }));
}

/** Nomes oferecidos na grade em foco, na ordem em que aparecem. */
function opcoes(): string[] {
  return screen.getAllByRole("radio").map((radio) => radio.closest("label")?.textContent ?? "");
}

function enviar() {
  fireEvent.click(screen.getByRole("button", { name: /adicionar|salvar/i }));
}

/** Avança Continuar até sobrar só Adicionar/Salvar (3 ou 4 etapas conforme o fluxo). */
function avancarAteOFim() {
  for (let i = 0; i < 6 && screen.queryByRole("button", { name: "Continuar" }); i += 1) {
    continuar();
  }
}

/** Etapa 1 preenchida, depois avança até a etapa de pagamento. */
function ateOPagamento(descricao = "Padaria", valor = "10,00") {
  preencherDados(descricao, valor);
  avancarAteOFim();
}

describe("navegação entre etapas", () => {
  it("começa nos dados da compra", () => {
    montar();

    expect(screen.getByLabelText("Descrição")).toBeDefined();
    expect(screen.queryByRole("radio", { name: "Alimentacao" })).toBeNull();
  });

  it("avança e volta preservando o que foi digitado", () => {
    // O rascunho vive na wizard, não nas etapas. Se cada etapa guardasse o
    // próprio estado, voltar apagaria o que o usuário digitou.
    montar();
    preencherDados("Farmacia", "25,50");

    continuar(); // Repetir
    continuar(); // Categoria
    escolher("Alimentacao");
    fireEvent.click(screen.getByRole("button", { name: /Dados/ }));

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

    expect(screen.getByRole("radio", { name: "Sem forma de pagamento" })).toBeDefined();
  });

  it("só a última etapa oferece o botão de salvar", () => {
    montar();
    preencherDados();
    expect(screen.queryByRole("button", { name: /^Adicionar/ })).toBeNull();

    continuar(); // Repetir
    expect(screen.queryByRole("button", { name: /^Adicionar/ })).toBeNull();

    continuar(); // Categoria
    expect(screen.queryByRole("button", { name: /^Adicionar/ })).toBeNull();

    continuar(); // Pagamento
    expect(screen.getByRole("button", { name: /^Adicionar/ })).toBeDefined();
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

    expect(onSubmit).toHaveBeenCalledWith(
      {
        kind: "expense",
        description: "Padaria",
        amountMinor: 1234,
        currency: "BRL",
        categoryId: null,
        paymentMethodId: null,
        cashbackMinor: null,
        occurredOn: "2026-08-08",
        recurrenceId: null,
        occurrenceKey: null,
      },
      null,
    );
  });

  it("categoria e forma de pagamento são opcionais", () => {
    const { onSubmit } = montar();
    ateOPagamento();

    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null, paymentMethodId: null }),
      null,
    );
  });

  it("carrega as escolhas de categoria e pagamento", () => {
    const { onSubmit } = montar();
    preencherDados();
    continuar(); // Repetir
    continuar(); // Categoria
    escolher("Alimentacao");
    continuar(); // Pagamento
    escolher("Pix");

    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "cat-1", paymentMethodId: "pm-pix" }),
      null,
    );
  });

  it("preenche os campos ao editar e abre na primeira etapa", () => {
    montar({ editing: { ...RECORD, categoryId: "cat-1", paymentMethodId: "pm-pix" } });

    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("Mercado");
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("123,45");

    fireEvent.click(screen.getByRole("button", { name: /Categoria/ }));
    expect(screen.getByRole("radio", { name: "Alimentacao" })).toHaveProperty("checked", true);
  });
});

describe("cashback condicionado", () => {
  it("mostra o campo para credito e para debito", () => {
    montar();
    ateOPagamento();

    escolher("Cartao credito");
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();

    escolher("Cartao debito");
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();
  });

  it("esconde o campo para dinheiro, pix e outros", () => {
    montar();
    ateOPagamento();

    for (const nome of ["Dinheiro", "Pix", "Vale"]) {
      escolher(nome);
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
    escolher("Cartao credito");
    expect(screen.getByLabelText(/cashback/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Dados/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Receita" }));
    fireEvent.click(screen.getByRole("button", { name: /Pagamento/ }));

    expect(screen.queryByLabelText(/cashback/i)).toBeNull();
  });
});

describe("limpeza do cashback", () => {
  const COM_CASHBACK: Transaction = {
    ...RECORD,
    paymentMethodId: "pm-credito",
    cashbackMinor: 500,
  };

  it("trocar para dinheiro emite cashbackMinor null", () => {
    // O teste mais importante da fatia 3, preservado aqui. Esconder sem limpar
    // deixaria dado sujo permanente: invisivel na tela, presente no export,
    // replicado pelo sync.
    const { onSubmit } = montar({ editing: COM_CASHBACK });
    fireEvent.click(screen.getByRole("button", { name: /Pagamento/ }));
    expect((screen.getByLabelText(/cashback/i) as HTMLInputElement).value).toBe("5,00");

    escolher("Dinheiro");
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethodId: "pm-dinheiro", cashbackMinor: null }),
      null,
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

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cashbackMinor: null }), null);
  });

  it("manter o cartão preserva o cashback digitado", () => {
    const { onSubmit } = montar({ editing: COM_CASHBACK });
    fireEvent.click(screen.getByRole("button", { name: /Pagamento/ }));

    fireEvent.input(screen.getByLabelText(/cashback/i), { target: { value: "7,50" } });
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cashbackMinor: 750 }), null);
  });
});

describe("referências e listas vazias", () => {
  it("mantém a seleção de uma categoria apagada, com rótulo neutro", () => {
    montar({ editing: { ...RECORD, categoryId: "cat-apagada" } });

    fireEvent.click(screen.getByRole("button", { name: /Categoria/ }));

    expect(screen.getByRole("radio", { name: "Categoria removida" })).toHaveProperty(
      "checked",
      true,
    );
  });

  it("sem nada cadastrado mostra atalho em vez de dropdown vazio", () => {
    montar({ categories: [], paymentMethods: [] });
    preencherDados();
    continuar(); // Repetir
    continuar(); // Categoria

    expect(screen.queryByRole("radio", { name: "Alimentacao" })).toBeNull();
    expect(screen.getByText(/Cadastre em Categorias/)).toBeDefined();
  });
});

describe("categoria filtrada pelo tipo do lancamento", () => {
  const TODAS: Category[] = [
    { ...(CATEGORIAS[0] as Category), id: "cat-desp", name: "Alimentacao", kind: "expense" },
    { ...(CATEGORIAS[0] as Category), id: "cat-rec", name: "Salario", kind: "income" },
    { ...(CATEGORIAS[0] as Category), id: "cat-ambos", name: "Investimentos", kind: "both" },
  ];

  function ateACategoria() {
    preencherDados();
    continuar(); // Repetir
    continuar(); // Categoria
  }

  it("despesa nao oferece categoria de receita", () => {
    // "Salario" oferecido ao lancar uma despesa e a razao de `kind` existir.
    montar({ categories: TODAS, initialKind: "expense" });
    ateACategoria();

    expect(opcoes()).toContain("Alimentacao");
    expect(opcoes()).not.toContain("Salario");
  });

  it("receita nao oferece categoria de despesa", () => {
    montar({ categories: TODAS, initialKind: "income" });
    ateACategoria();

    expect(opcoes()).toContain("Salario");
    expect(opcoes()).not.toContain("Alimentacao");
  });

  it("categoria dos dois lados aparece nas duas listas", () => {
    montar({ categories: TODAS, initialKind: "expense" });
    ateACategoria();
    expect(opcoes()).toContain("Investimentos");

    cleanup();

    montar({ categories: TODAS, initialKind: "income" });
    ateACategoria();
    expect(opcoes()).toContain("Investimentos");
  });

  it("trocar o tipo na etapa 1 troca a lista de categorias", () => {
    // O filtro e reativo: sem isso, quem abre pelo botao de despesa e muda para
    // receita continuaria vendo as categorias erradas.
    montar({ categories: TODAS, initialKind: "expense" });
    preencherDados();
    fireEvent.click(screen.getByRole("radio", { name: /receita/i }));
    ateACategoria();

    expect(opcoes()).toContain("Salario");
    expect(opcoes()).not.toContain("Alimentacao");
  });

  it("a categoria escolhida sobrevive a troca de tipo com o proprio nome", () => {
    // Reanexada a grade, e nao tratada como referencia morta: rotula-la
    // "Categoria removida" seria mentira — ela existe, so nao serve a este lado
    // do lancamento.
    montar({ categories: TODAS, initialKind: "expense" });
    ateACategoria();
    escolher("Alimentacao");
    fireEvent.click(screen.getByRole("button", { name: /Dados/ }));
    fireEvent.click(screen.getByRole("radio", { name: /receita/i }));
    fireEvent.click(screen.getByRole("button", { name: /Categoria/ }));

    expect(screen.getByRole("radio", { name: "Alimentacao" })).toHaveProperty("checked", true);
    expect(screen.queryByRole("radio", { name: "Categoria removida" })).toBeNull();
  });

  it("trocar o tipo nao apaga em silencio a categoria ja escolhida", () => {
    // Mesmo caminho da referencia apagada: a EntitySelect mantem selecionado o
    // que sumiu da lista. Limpar aqui apagaria uma escolha do usuario por causa
    // de um toque no segmento de tipo.
    const { onSubmit } = montar({ categories: TODAS, initialKind: "expense" });
    ateACategoria();
    escolher("Alimentacao");
    fireEvent.click(screen.getByRole("button", { name: /Dados/ }));
    fireEvent.click(screen.getByRole("radio", { name: /receita/i }));
    avancarAteOFim();
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "income", categoryId: "cat-desp" }),
      null,
    );
  });

  it("emite regra de recorrencia na etapa Repetir", () => {
    const { onSubmit } = montar({ today: "2026-08-11" });
    preencherDados("Salário", "5000,00");
    continuar();

    expect(screen.getByRole("button", { name: /Repetir/ })).toBeDefined();
    fireEvent.click(screen.getByRole("checkbox", { name: /repetir este lançamento/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Mensal" }));
    fireEvent.change(screen.getByLabelText(/^quando$/i), {
      target: { value: "nthBusinessDay" },
    });
    fireEvent.input(screen.getByLabelText(/nº do dia útil/i), { target: { value: "5" } });
    avancarAteOFim();
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Salário", amountMinor: 500_000 }),
      {
        frequency: "monthly",
        scheduleType: "nthBusinessDay",
        scheduleN: 5,
        endOn: null,
      },
    );
  });

  it("na edicao nao oferece a etapa de repetir", () => {
    montar({ editing: RECORD });
    expect(screen.queryByRole("button", { name: /^Repetir$/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Categoria/ })).toBeDefined();
  });
});

describe("regressao: avancar nao pode virar submit", () => {
  it("o botao de avancar nao se transforma em salvar sob o proprio clique", () => {
    // Os dois botoes ocupavam a mesma posicao no JSX, entao o Preact
    // reaproveitava o no e so trocava o atributo `type`. O navegador executa a
    // activation behavior **depois** do handler: o clique em "Continuar"
    // avancava a etapa, o no virava type="submit", e o lancamento era gravado
    // em vez de a etapa 3 aparecer.
    //
    // Clique sintetico nao reproduz — roda tudo sincrono, antes do re-render.
    // Por isso o teste afirma a causa, e nao o sintoma.
    montar();
    preencherDados();
    continuar(); // Ainda nao e a ultima etapa (falta Categoria e Pagamento)

    const avancar = screen.getByRole("button", { name: "Continuar" });
    expect(avancar.getAttribute("type")).toBe("button");
    fireEvent.click(avancar);

    // Continuar de novo: se o no tivesse virado submit, gravaria aqui.
    expect(screen.getByRole("button", { name: "Continuar" }).getAttribute("type")).toBe("button");
    expect(screen.queryByRole("button", { name: /adicionar|salvar/i })).toBeNull();
  });
});

describe("data em atalhos", () => {
  it("Hoje é o padrão e Ontem troca a data num toque", () => {
    const { onSubmit } = montar();
    expect(screen.getByRole("button", { name: "Hoje" }).getAttribute("aria-pressed")).toBe("true");

    preencherDados();
    fireEvent.click(screen.getByRole("button", { name: "Ontem" }));
    avancarAteOFim();
    enviar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ occurredOn: "2026-08-07" }),
      null,
    );
  });

  it("Outra data abre o calendário e o chip passa a mostrar a data escolhida", () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Outra data" }));
    fireEvent.click(screen.getByRole("button", { name: "4 de agosto de 2026" }));

    expect(screen.getByRole("button", { name: /Ter, 4 ago/ })).toBeDefined();
  });
});

describe("recorrência", () => {
  it("mostra as próximas vezes calculadas pela regra", () => {
    montar({ today: "2026-09-24" });
    preencherDados("Salário", "6500,00");
    continuar();

    fireEvent.click(screen.getByRole("checkbox", { name: /repetir este lançamento/i }));

    for (const chip of ["24 out", "24 nov", "24 dez", "24 jan"]) {
      expect(screen.getByText(chip)).toBeDefined();
    }
  });

  it("o resumo mostra o que foi preenchido na etapa 1", () => {
    montar();
    preencherDados("Padaria", "12,34");
    continuar();

    expect(screen.getByText("Padaria")).toBeDefined();
    expect(screen.getByText(/R\$\s12,34/)).toBeDefined();
  });
});

describe("edição", () => {
  it("salva direto do primeiro passo, sem percorrer os outros", () => {
    const { onSubmit } = montar({ editing: RECORD });
    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Feira" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ description: "Feira" }), null);
  });

  it("exclui só depois de segurar a lixeira", () => {
    vi.useFakeTimers();
    const onDelete = vi.fn();
    montar({ editing: RECORD, onDelete });
    const lixeira = screen.getByRole("button", { name: "Excluir Mercado (segure para confirmar)" });

    fireEvent.pointerDown(lixeira);
    fireEvent.pointerUp(lixeira);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.pointerDown(lixeira);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("diz quem criou o lançamento", () => {
    montar({ editing: RECORD, author: { name: "Luiz", color: "sky" } });

    expect(screen.getByText(/Criado por Luiz/)).toBeDefined();
  });
});
