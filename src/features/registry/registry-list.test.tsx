import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CategoryRecord } from "../../domain/projections/apply";
import { RegistryList } from "./registry-list";

afterEach(cleanup);

function categoria(overrides: Partial<CategoryRecord> & { id: string }): CategoryRecord {
  return {
    name: "Mercado",
    icon: "utensils",
    color: "emerald",
    kind: "expense",
    deleted: false,
    materialized: true,
    fieldHlc: {},
    ...overrides,
  };
}

const NOOP = { onEdit: () => {}, emptyHint: "Nada aqui ainda." };

describe("RegistryList", () => {
  it("mostra nome, ícone e cor de cada item", () => {
    render(<RegistryList {...NOOP} items={[categoria({ id: "a" })]} />);

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Mercado")).toBeDefined();
    expect(within(item).getByTestId("icon-utensils")).toBeDefined();
    expect(item.innerHTML).toContain("--color-tag-emerald");
  });

  it("cai no ícone e na cor neutros para valores de uma versão futura", () => {
    render(
      <RegistryList
        {...NOOP}
        items={[categoria({ id: "a", icon: "futuro", color: "chartreuse" })]}
      />,
    );

    const item = screen.getByRole("listitem");
    expect(within(item).getByTestId("icon-fallback")).toBeDefined();
    expect(item.innerHTML).toContain("--color-tag-slate");
  });

  it("mostra a dica quando não há nada", () => {
    render(<RegistryList {...NOOP} items={[]} />);

    expect(screen.getByText("Nada aqui ainda.")).toBeDefined();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("a linha inteira abre a edicao do item certo, sem botao de excluir", () => {
    const onEdit = vi.fn();
    const itens = [categoria({ id: "a" }), categoria({ id: "b", name: "Farmacia" })];
    render(<RegistryList {...NOOP} onEdit={onEdit} items={itens} />);

    const segundo = screen.getAllByRole("listitem")[1] as HTMLElement;
    fireEvent.click(within(segundo).getByRole("button", { name: /editar farmacia/i }));

    expect(onEdit).toHaveBeenCalledWith(itens[1]);
    expect(screen.queryByRole("button", { name: /excluir/i })).toBeNull();
  });
});
