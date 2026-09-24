import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STATE, type ProjectionState } from "../../domain/projections/apply";
import { HOLD_MS } from "../ui/hold-button";
import { RegistryPage } from "./registry-page";
import type { RegistryStore } from "./store";

afterEach(cleanup);

function fakeStore(): RegistryStore {
  return {
    addCategory: vi.fn(async () => {}),
    editCategory: vi.fn(async () => {}),
    removeCategory: vi.fn(async () => {}),
    addPaymentMethod: vi.fn(async () => {}),
    editPaymentMethod: vi.fn(async () => {}),
    removePaymentMethod: vi.fn(async () => {}),
  };
}

const CATEGORIA = {
  id: "cat-1",
  name: "Mercado",
  icon: "utensils",
  color: "emerald",
  kind: "expense",
  deleted: false,
  materialized: true,
  fieldHlc: {},
};

const RECEITA = {
  id: "cat-2",
  name: "Salário",
  icon: "banknote",
  color: "emerald",
  kind: "income",
  deleted: false,
  materialized: true,
  fieldHlc: {},
};

const AMBAS = {
  id: "cat-3",
  name: "Investimentos",
  icon: "chart",
  color: "sky",
  kind: "both",
  deleted: false,
  materialized: true,
  fieldHlc: {},
};

const stateWith = (over: Partial<ProjectionState>): ProjectionState => ({
  ...EMPTY_STATE,
  ...over,
});

/** O formulario agora vive num modal: e preciso abri-lo primeiro. */
function abrirCadastro() {
  fireEvent.click(screen.getByRole("button", { name: /\+ nova (categoria|forma)/i }));
}

function abrirEdicao() {
  fireEvent.click(screen.getByRole("button", { name: /editar/i }));
}

function preencherNome(valor: string) {
  fireEvent.input(screen.getByRole("textbox", { name: "Nome" }), { target: { value: valor } });
}

/** Avanca as tres etapas e salva. */
function salvar() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: /adicionar|salvar/i }));
}

describe("RegistryPage", () => {
  it("a mesma composição serve categorias e formas de pagamento", () => {
    const store = fakeStore();
    const { unmount } = render(
      <RegistryPage
        entity="category"
        state={EMPTY_STATE}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Categorias" })).toBeDefined();
    abrirCadastro();
    expect(screen.queryByLabelText(/tipo de pagamento/i)).toBeNull();
    unmount();

    render(
      <RegistryPage
        entity="paymentMethod"
        state={EMPTY_STATE}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Formas de pagamento" })).toBeDefined();
    abrirCadastro();
    expect(screen.getByLabelText(/tipo de pagamento/i)).toBeDefined();
  });

  it("criar categoria chama a store da entidade certa", () => {
    const store = fakeStore();
    render(
      <RegistryPage
        entity="category"
        state={EMPTY_STATE}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );

    abrirCadastro();
    preencherNome("Transporte");
    salvar();

    expect(store.addCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "Transporte" }));
    expect(store.addPaymentMethod).not.toHaveBeenCalled();
  });

  it("criar forma de pagamento nao chama a store de categoria", () => {
    const store = fakeStore();
    render(
      <RegistryPage
        entity="paymentMethod"
        state={EMPTY_STATE}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );

    abrirCadastro();
    preencherNome("Nubank");
    salvar();

    expect(store.addPaymentMethod).toHaveBeenCalled();
    expect(store.addCategory).not.toHaveBeenCalled();
  });

  it("editar emite apenas o patch, nao o agregado inteiro", () => {
    // Emitir tudo num update faria o LWW por campo perder edicoes concorrentes
    // sem nenhum sintoma visivel.
    const store = fakeStore();
    render(
      <RegistryPage
        entity="category"
        state={stateWith({ categories: { "cat-1": CATEGORIA } })}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );

    abrirEdicao();
    preencherNome("Supermercado");
    salvar();

    expect(store.editCategory).toHaveBeenCalledWith("cat-1", { name: "Supermercado" });
  });

  it("editar sem mudar nada emite patch vazio, que a store descarta", () => {
    const store = fakeStore();
    render(
      <RegistryPage
        entity="category"
        state={stateWith({ categories: { "cat-1": CATEGORIA } })}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );

    abrirEdicao();
    salvar();

    expect(store.editCategory).toHaveBeenCalledWith("cat-1", {});
  });

  it("excluir chama a store com o id", () => {
    const store = fakeStore();
    render(
      <RegistryPage
        entity="category"
        state={stateWith({ categories: { "cat-1": CATEGORIA } })}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );

    // Excluir saiu da linha: mora no sheet de edicao, e exige segurar.
    vi.useFakeTimers();
    abrirEdicao();
    fireEvent.pointerDown(screen.getByRole("button", { name: /excluir mercado/i }));
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    vi.useRealTimers();

    expect(store.removeCategory).toHaveBeenCalledWith("cat-1");
  });

  it("lista so o bucket da entidade da pagina", () => {
    const store = fakeStore();
    render(
      <RegistryPage
        entity="paymentMethod"
        state={stateWith({
          categories: { "cat-1": CATEGORIA },
          paymentMethods: { "pm-1": { ...CATEGORIA, id: "pm-1", name: "Nubank", kind: "credit" } },
        })}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Nubank")).toBeDefined();
    expect(screen.queryByText("Mercado")).toBeNull();
  });

  it("categorias abrem em despesas e separam receitas na outra aba", () => {
    // Lista unica misturava Salario com Mercado e forçava rolar para achar o lado
    // certo. A aba espelha o filtro do formulario de lancamento (`listCategoriesFor`).
    const store = fakeStore();
    render(
      <RegistryPage
        entity="category"
        state={stateWith({
          categories: {
            "cat-1": CATEGORIA,
            "cat-2": RECEITA,
            "cat-3": AMBAS,
          },
        })}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: /^Despesas/ })).toBeDefined();
    expect(screen.getByRole("radio", { name: /^Receitas/ })).toBeDefined();

    expect(screen.getByText("Mercado")).toBeDefined();
    expect(screen.getByText("Investimentos")).toBeDefined();
    expect(screen.queryByText("Salário")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /^Receitas/ }));

    expect(screen.getByText("Salário")).toBeDefined();
    expect(screen.getByText("Investimentos")).toBeDefined();
    expect(screen.queryByText("Mercado")).toBeNull();
  });

  it("formas de pagamento nao ganham abas de receita e despesa", () => {
    const store = fakeStore();
    render(
      <RegistryPage
        entity="paymentMethod"
        state={EMPTY_STATE}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByRole("radio", { name: /^Despesas/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Receitas/ })).toBeNull();
  });

  it("mostra dica vazia do lado da aba ativa", () => {
    const store = fakeStore();
    render(
      <RegistryPage
        entity="category"
        state={stateWith({ categories: { "cat-1": CATEGORIA } })}
        items={[]}
        today="2026-09-24"
        store={store}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /^Receitas/ }));
    expect(screen.getByText("Nenhuma categoria de receita ainda.")).toBeDefined();
  });

  it("as abas contam quantas categorias cada lado tem", () => {
    render(
      <RegistryPage
        entity="category"
        state={stateWith({ categories: { "cat-1": CATEGORIA, "cat-2": RECEITA, "cat-3": AMBAS } })}
        items={[]}
        today="2026-09-24"
        store={fakeStore()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: "Despesas (2)" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Receitas (2)" })).toBeDefined();
  });

  it("mostra o uso no mes para ajudar a decidir o que excluir", () => {
    const lancamento = {
      id: "t-1",
      kind: "expense" as const,
      description: "Feira",
      amountMinor: 100,
      currency: "BRL" as const,
      categoryId: "cat-1",
      paymentMethodId: null,
      cashbackMinor: null,
      occurredOn: "2026-09-10",
      userId: null,
      recurrenceId: null,
      occurrenceKey: null,
      deleted: false,
      materialized: true,
      fieldHlc: {},
    };
    render(
      <RegistryPage
        entity="category"
        state={stateWith({ categories: { "cat-1": CATEGORIA, "cat-3": AMBAS } })}
        items={[lancamento]}
        today="2026-09-24"
        store={fakeStore()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("1 lançamento no mês")).toBeDefined();
    expect(screen.getByText("Sem lançamentos no mês")).toBeDefined();
  });

  it("pagamentos mostram o tipo e marcam o que libera cashback", () => {
    render(
      <RegistryPage
        entity="paymentMethod"
        state={stateWith({
          paymentMethods: {
            "pm-1": { ...CATEGORIA, id: "pm-1", name: "Nubank", kind: "credit" },
            "pm-2": { ...CATEGORIA, id: "pm-2", name: "Pix", kind: "pix" },
          },
        })}
        items={[]}
        today="2026-09-24"
        store={fakeStore()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Crédito")).toBeDefined();
    expect(screen.getAllByText("cashback")).toHaveLength(1);
  });
});
