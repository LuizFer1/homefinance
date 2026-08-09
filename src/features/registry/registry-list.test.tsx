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
    deleted: false,
    materialized: true,
    fieldHlc: {},
    ...overrides,
  };
}

const NOOP = { onEdit: () => {}, onDelete: () => {}, emptyHint: "Nada aqui ainda." };

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

  it("entrega o item certo ao editar e o id certo ao excluir", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const items = [categoria({ id: "a", name: "Aluguel" }), categoria({ id: "b", name: "Bar" })];
    render(<RegistryList {...NOOP} items={items} onEdit={onEdit} onDelete={onDelete} />);

    const segundo = screen.getAllByRole("listitem")[1] as HTMLElement;
    fireEvent.click(within(segundo).getByRole("button", { name: /editar/i }));
    fireEvent.click(within(segundo).getByRole("button", { name: /excluir/i }));

    expect(onEdit).toHaveBeenCalledWith(items[1]);
    expect(onDelete).toHaveBeenCalledWith("b");
  });
});
