import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STATE, type ProjectionState } from "../../domain/projections/apply";
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
  fireEvent.input(screen.getByLabelText(/nome/i), { target: { value: valor } });
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
      <RegistryPage entity="category" state={EMPTY_STATE} store={store} onBack={vi.fn()} />,
    );
    expect(screen.getByRole("region", { name: "Categorias" })).toBeDefined();
    abrirCadastro();
    expect(screen.queryByLabelText(/tipo de pagamento/i)).toBeNull();
    unmount();

    render(
      <RegistryPage entity="paymentMethod" state={EMPTY_STATE} store={store} onBack={vi.fn()} />,
    );
    expect(screen.getByRole("region", { name: "Formas de pagamento" })).toBeDefined();
    abrirCadastro();
    expect(screen.getByLabelText(/tipo de pagamento/i)).toBeDefined();
  });

  it("criar categoria chama a store da entidade certa", () => {
    const store = fakeStore();
    render(<RegistryPage entity="category" state={EMPTY_STATE} store={store} onBack={vi.fn()} />);

    abrirCadastro();
    preencherNome("Transporte");
    salvar();

    expect(store.addCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "Transporte" }));
    expect(store.addPaymentMethod).not.toHaveBeenCalled();
  });

  it("criar forma de pagamento nao chama a store de categoria", () => {
    const store = fakeStore();
    render(
      <RegistryPage entity="paymentMethod" state={EMPTY_STATE} store={store} onBack={vi.fn()} />,
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
        store={store}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /excluir/i }));

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
        store={store}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Nubank")).toBeDefined();
    expect(screen.queryByText("Mercado")).toBeNull();
  });
});
