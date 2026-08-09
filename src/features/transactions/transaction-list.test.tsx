import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "../../domain/projections/apply";
import { TransactionList } from "./transaction-list";

afterEach(cleanup);

function record(overrides: Partial<TransactionRecord> & { id: string }): TransactionRecord {
  return {
    kind: "expense",
    description: "Mercado",
    amountMinor: 12_345,
    currency: "BRL",
    categoryId: null,
    occurredOn: "2026-08-07",
    deleted: false,
    materialized: true,
    fieldHlc: {},
    ...overrides,
  };
}

const ITEMS = [record({ id: "a" }), record({ id: "b", description: "Salário", kind: "income" })];

describe("TransactionList", () => {
  it("mostra uma linha por lançamento", () => {
    render(<TransactionList items={ITEMS} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Mercado")).toBeDefined();
    expect(screen.getByText("Salário")).toBeDefined();
  });

  it("avisa quando não há lançamentos", () => {
    render(<TransactionList items={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("Nenhum lançamento ainda.")).toBeDefined();
  });

  it("pede edição do registro clicado", () => {
    const onEdit = vi.fn();
    render(<TransactionList items={ITEMS} onEdit={onEdit} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar Salário" }));

    expect(onEdit).toHaveBeenCalledWith(ITEMS[1]);
  });

  it("pede exclusão do registro clicado", () => {
    const onDelete = vi.fn();
    render(<TransactionList items={ITEMS} onEdit={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Excluir Mercado" }));

    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("distingue receita de despesa no valor exibido", () => {
    render(<TransactionList items={ITEMS} onEdit={vi.fn()} onDelete={vi.fn()} />);

    const linhas = screen.getAllByRole("listitem");

    expect(linhas[0]?.textContent).toContain("123,45");
    expect(linhas[1]?.textContent).toContain("123,45");
    expect(linhas[0]?.textContent).not.toBe(linhas[1]?.textContent);
  });
});
