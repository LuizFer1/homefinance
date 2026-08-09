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
  deleted: false,
  materialized: true,
  fieldHlc: {},
};

const stateWith = (over: Partial<ProjectionState>): ProjectionState => ({
  ...EMPTY_STATE,
  ...over,
});

function preencherNome(valor: string) {
  fireEvent.input(screen.getByLabelText(/nome/i), { target: { value: valor } });
}

function salvar() {
  fireEvent.submit(
    screen.getByRole("button", { name: /adicionar|salvar/i }).closest("form") as HTMLFormElement,
  );
}

describe("RegistryPage", () => {
  it("a mesma composição serve categorias e formas de pagamento", () => {
    const store = fakeStore();
    const { unmount } = render(
      <RegistryPage entity="category" state={EMPTY_STATE} store={store} />,
    );
    expect(screen.getByRole("region", { name: "Categorias" })).toBeDefined();
    expect(screen.queryByLabelText(/tipo de pagamento/i)).toBeNull();
    unmount();

    render(<RegistryPage entity="paymentMethod" state={EMPTY_STATE} store={store} />);
    expect(screen.getByRole("region", { name: "Formas de pagamento" })).toBeDefined();
    expect(screen.getByLabelText(/tipo de pagamento/i)).toBeDefined();
  });

  it("criar categoria chama a store da entidade certa", () => {
    const store = fakeStore();
    render(<RegistryPage entity="category" state={EMPTY_STATE} store={store} />);

    preencherNome("Transporte");
    salvar();

    expect(store.addCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "Transporte" }));
    expect(store.addPaymentMethod).not.toHaveBeenCalled();
  });

  it("criar forma de pagamento nao chama a store de categoria", () => {
    const store = fakeStore();
    render(<RegistryPage entity="paymentMethod" state={EMPTY_STATE} store={store} />);

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
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
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
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
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
      />,
    );

    expect(screen.getByText("Nubank")).toBeDefined();
    expect(screen.queryByText("Mercado")).toBeNull();
  });
});
