import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_STATE,
  type ProjectionState,
  type TransactionRecord,
} from "../../domain/projections/apply";
import { TransactionList } from "./transaction-list";

afterEach(cleanup);

function record(overrides: Partial<TransactionRecord> & { id: string }): TransactionRecord {
  return {
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
    ...overrides,
  };
}

const ITEMS = [record({ id: "a" }), record({ id: "b", description: "Salário", kind: "income" })];

const STATE: ProjectionState = {
  ...EMPTY_STATE,
  categories: {
    "cat-viva": {
      id: "cat-viva",
      name: "Alimentacao",
      icon: "utensils",
      color: "emerald",
      deleted: false,
      materialized: true,
      fieldHlc: {},
    },
    "cat-apagada": {
      id: "cat-apagada",
      name: "Antiga",
      icon: "tag",
      color: "slate",
      deleted: true,
      materialized: true,
      fieldHlc: {},
    },
  },
  paymentMethods: {
    "pm-viva": {
      id: "pm-viva",
      name: "Nubank",
      icon: "credit-card",
      color: "violet",
      kind: "credit",
      deleted: false,
      materialized: true,
      fieldHlc: {},
    },
  },
};

describe("TransactionList", () => {
  it("mostra uma linha por lançamento", () => {
    render(<TransactionList items={ITEMS} state={STATE} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Mercado")).toBeDefined();
    expect(screen.getByText("Salário")).toBeDefined();
  });

  it("avisa quando não há lançamentos", () => {
    render(<TransactionList items={[]} state={STATE} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("Nenhum lançamento ainda.")).toBeDefined();
  });

  it("pede edição do registro clicado", () => {
    const onEdit = vi.fn();
    render(<TransactionList items={ITEMS} state={STATE} onEdit={onEdit} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar Salário" }));

    expect(onEdit).toHaveBeenCalledWith(ITEMS[1]);
  });

  it("pede exclusão do registro clicado", () => {
    const onDelete = vi.fn();
    render(<TransactionList items={ITEMS} state={STATE} onEdit={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Excluir Mercado" }));

    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("distingue receita de despesa no valor exibido", () => {
    render(<TransactionList items={ITEMS} state={STATE} onEdit={vi.fn()} onDelete={vi.fn()} />);

    const linhas = screen.getAllByRole("listitem");

    expect(linhas[0]?.textContent).toContain("123,45");
    expect(linhas[1]?.textContent).toContain("123,45");
    expect(linhas[0]?.textContent).not.toBe(linhas[1]?.textContent);
  });
});

describe("rotulos de categoria, forma de pagamento e cashback", () => {
  const BASE_ITEM = ITEMS[0] ?? record({ id: "a" });

  function comAtributos(over: Partial<TransactionRecord>) {
    render(
      <TransactionList
        items={[{ ...BASE_ITEM, ...over }]}
        state={STATE}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
  }

  it("mostra categoria e forma de pagamento resolvidas", () => {
    comAtributos({ categoryId: "cat-viva", paymentMethodId: "pm-viva" });

    expect(screen.getByText(/Alimentacao/)).toBeDefined();
    expect(screen.getByText(/Nubank/)).toBeDefined();
  });

  it("referencia morta sai como rotulo neutro, nunca como id cru", () => {
    // Apagar categoria nao cascateia, entao este e estado normal e permanente.
    comAtributos({ categoryId: "cat-apagada" });

    expect(screen.getByText(/Categoria removida/)).toBeDefined();
    expect(screen.queryByText(/cat-apagada/)).toBeNull();
  });

  it("id que nunca existiu tambem cai no rotulo neutro", () => {
    comAtributos({ categoryId: "cat-fantasma" });

    expect(screen.getByText(/Categoria removida/)).toBeDefined();
  });

  it("mostra o cashback quando existe", () => {
    comAtributos({ paymentMethodId: "pm-viva", cashbackMinor: 250 });

    expect(screen.getByText(/de volta/)).toBeDefined();
  });

  it("nao mostra segunda linha quando nao ha nada a dizer", () => {
    // "Sem categoria - Sem forma de pagamento" em toda linha seria ruido
    // constante e empurraria o valor, que e o dado que importa.
    comAtributos({ categoryId: null, paymentMethodId: null, cashbackMinor: null });

    expect(screen.queryByText(/Sem categoria/)).toBeNull();
    expect(screen.queryByText(/de volta/)).toBeNull();
  });
});
