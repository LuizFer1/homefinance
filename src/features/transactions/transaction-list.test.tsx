import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../../domain/model/app-state";
import { ALIVE, DELETED_AT } from "../../domain/model/row.fake";
import type { Transaction } from "../../domain/model/transaction";
import { MINUS } from "../ui/money";
import { TransactionList } from "./transaction-list";

afterEach(cleanup);

function record(overrides: Partial<Transaction> & { id: string }): Transaction {
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
    recurrenceId: null,
    occurrenceKey: null,
    ...ALIVE,
    ...overrides,
  };
}

const ITEMS = [record({ id: "a" }), record({ id: "b", description: "Salário", kind: "income" })];

const STATE: AppState = {
  ...EMPTY_APP_STATE,
  categories: {
    "cat-viva": {
      id: "cat-viva",
      name: "Alimentacao",
      icon: "utensils",
      color: "emerald",
      kind: "expense",
      ...ALIVE,
    },
    "cat-apagada": {
      id: "cat-apagada",
      name: "Antiga",
      icon: "tag",
      color: "slate",
      kind: "expense",
      ...ALIVE,
      deletedAt: DELETED_AT,
    },
  },
  paymentMethods: {
    "pm-viva": {
      id: "pm-viva",
      name: "Nubank",
      icon: "credit-card",
      color: "violet",
      kind: "credit",
      ...ALIVE,
    },
  },
};

describe("TransactionList", () => {
  it("mostra uma linha por lançamento", () => {
    render(<TransactionList items={ITEMS} state={STATE} today="2026-08-08" onEdit={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Mercado")).toBeDefined();
    expect(screen.getByText("Salário")).toBeDefined();
  });

  it("avisa quando não há lançamentos", () => {
    const { container } = render(
      <TransactionList items={[]} state={STATE} today="2026-08-08" onEdit={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: /Nenhum lançamento ainda/i })).toBeDefined();
    // Sem ilustração genérica: o vazio prenuncia a lista com linhas-fantasma.
    expect(container.querySelector("img")).toBeNull();
  });

  it("pede edição do registro clicado", () => {
    const onEdit = vi.fn();
    render(<TransactionList items={ITEMS} state={STATE} today="2026-08-08" onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar Salário" }));

    expect(onEdit).toHaveBeenCalledWith(ITEMS[1]);
  });

  it("não oferece excluir na linha: excluir mora na edição", () => {
    render(<TransactionList items={ITEMS} state={STATE} today="2026-08-08" onEdit={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Excluir/ })).toBeNull();
  });

  it("distingue receita de despesa no valor exibido", () => {
    render(<TransactionList items={ITEMS} state={STATE} today="2026-08-08" onEdit={vi.fn()} />);

    const linhas = screen.getAllByRole("listitem");

    expect(linhas[0]?.textContent).toContain("123,45");
    expect(linhas[1]?.textContent).toContain("123,45");
    expect(linhas[0]?.textContent).toContain(`${MINUS}R$`);
    expect(linhas[1]?.textContent).toContain("+R$");
  });
});

describe("rotulos de categoria, forma de pagamento e cashback", () => {
  const BASE_ITEM = ITEMS[0] ?? record({ id: "a" });

  function comAtributos(over: Partial<Transaction>) {
    render(
      <TransactionList
        items={[{ ...BASE_ITEM, ...over }]}
        state={STATE}
        today="2026-08-08"
        onEdit={vi.fn()}
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

  it("sem categoria nem forma, a meta fica so com o autor", () => {
    // "Sem categoria - Sem forma de pagamento" em toda linha seria ruido
    // constante e empurraria o valor, que e o dado que importa.
    comAtributos({ categoryId: null, paymentMethodId: null, cashbackMinor: null });

    expect(screen.queryByText(/Sem categoria/)).toBeNull();
    expect(screen.queryByText(/de volta/)).toBeNull();
  });
});

describe("autoria", () => {
  const AUTOR = "01J9F3K2M7QX8YB4TVWZ0DCEHU";

  const COM_AUTOR: AppState = {
    ...STATE,
    users: {
      [AUTOR]: {
        id: AUTOR,
        name: "Luiz",
        color: "teal",
        avatar: "data:image/webp;base64,AAAA",
        ...ALIVE,
      },
    },
  };

  function comAutor(userId: string | null) {
    render(
      <TransactionList
        items={[record({ id: "a", userId })]}
        state={COM_AUTOR}
        today="2026-08-08"
        onEdit={vi.fn()}
      />,
    );
    return screen.getByRole("listitem");
  }

  it("a cor do autor e um mini-avatar, nao fundo do item", () => {
    // Fundo colorido competiria com o unico dado que importa na tela: o
    // dinheiro. Mesmo raciocinio que o app.css ja registra para o tema.
    const item = comAutor(AUTOR);

    expect(item.className).not.toMatch(/bg-\[var\(--color-tag/);
    expect(item.querySelector("[data-testid='author-mark']")).not.toBeNull();
  });

  it("usa a cor do perfil que criou o lancamento", () => {
    const item = comAutor(AUTOR);

    expect(item.querySelector("[data-testid='author-mark']")?.getAttribute("style")).toContain(
      "--color-tag-teal",
    );
  });

  it("lancamento sem autor cai na cor neutra", () => {
    // O historico gravado antes desta fatia e este caso.
    const item = comAutor(null);

    expect(item.querySelector("[data-testid='author-mark']")?.getAttribute("style")).toContain(
      "--color-tag-slate",
    );
  });

  it("nao mostra a foto do autor na lista", () => {
    // Uma foto de 96px renderizada a 20px vira ruido cinza, e com um perfil so
    // ela se repete identica em toda linha, comunicando nada.
    comAutor(AUTOR);

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("o mini-avatar leva a inicial de quem lancou", () => {
    const item = comAutor(AUTOR);

    expect(item.querySelector("[data-testid='author-mark']")?.textContent).toBe("L");
  });
});

describe("agrupamento por dia", () => {
  const HOJE = "2026-08-10";

  function comItens(items: Transaction[]) {
    render(<TransactionList items={items} state={STATE} today={HOJE} onEdit={vi.fn()} />);
  }

  it("um cabecalho por dia, com o rotulo relativo", () => {
    comItens([
      record({ id: "a", occurredOn: HOJE }),
      record({ id: "b", occurredOn: "2026-08-09" }),
      record({ id: "c", occurredOn: "2026-08-05" }),
    ]);

    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Hoje · seg, 10 ago",
      "Ontem · dom, 9 ago",
      "Qua, 5 ago",
    ]);
  });

  it("a data nao se repete linha a linha", () => {
    // Era a repeticao mais cara da tela: uma coluna fixa a esquerda, em todo
    // item, com a mesma data do item de cima.
    comItens([record({ id: "a", occurredOn: HOJE }), record({ id: "b", occurredOn: HOJE })]);

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.queryByText("10/08")).toBeNull();
  });

  it("mostra o subtotal do dia quando ha mais de um lancamento", () => {
    comItens([
      record({ id: "a", occurredOn: HOJE, kind: "income", amountMinor: 300_000 }),
      record({ id: "b", occurredOn: HOJE, amountMinor: 21_000 }),
    ]);

    expect(screen.getByTestId("day-total").textContent).toContain("+R$");
    expect(screen.getByTestId("day-total").textContent).toContain("2.790,00");
  });

  it("nao mostra subtotal num dia de um lancamento so", () => {
    // Repetiria o valor da linha logo abaixo, palavra por palavra.
    comItens([record({ id: "a", occurredOn: HOJE })]);

    expect(screen.queryByTestId("day-total")).toBeNull();
  });
});

describe("ancora visual da linha", () => {
  function comCategoria(over: Partial<Transaction>) {
    render(
      <TransactionList
        items={[record({ id: "a", ...over })]}
        state={STATE}
        today="2026-08-08"
        onEdit={vi.fn()}
      />,
    );
  }

  it("usa o icone da categoria do lancamento", () => {
    comCategoria({ categoryId: "cat-viva" });

    expect(screen.getByTestId("icon-utensils")).toBeDefined();
  });

  it("sem categoria, cai no icone do tipo do lancamento", () => {
    // E a unica coisa que se sabe do lancamento sem categoria, e sao os mesmos
    // dois icones que a fila de acoes rapidas usa para criar cada tipo.
    comCategoria({ categoryId: null, kind: "expense" });
    expect(screen.getByTestId("icon-receipt")).toBeDefined();

    cleanup();

    comCategoria({ categoryId: null, kind: "income" });
    expect(screen.getByTestId("icon-banknote")).toBeDefined();
  });

  it("categoria apagada nao empresta seu icone nem sua cor", () => {
    // O nome vira rotulo neutro, mas icone e cor de um registro apagado nao
    // devem aparecer.
    comCategoria({ categoryId: "cat-apagada", kind: "expense" });

    expect(screen.queryByTestId("icon-tag")).toBeNull();
    expect(screen.getByTestId("icon-receipt")).toBeDefined();
  });

  it("a marca de autoria e um disco pequeno na meta da linha", () => {
    comCategoria({});

    const marca = screen.getByTestId("author-mark");
    expect(marca.className).toContain("rounded-full");
    expect(marca.className).toContain("size-3.5");
  });

  it("recorrente ganha a tag com a frequencia da serie", () => {
    render(
      <TransactionList
        items={[record({ id: "a", recurrenceId: "serie-sumida" })]}
        state={STATE}
        today="2026-08-08"
        onEdit={vi.fn()}
      />,
    );

    // Serie que nao esta no estado cai no rotulo generico.
    expect(screen.getByText("Recorrente")).toBeDefined();
  });
});
