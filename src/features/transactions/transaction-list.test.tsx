import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_STATE,
  type ProjectionState,
  type TransactionRecord,
} from "../../domain/projections/apply";
import { HOLD_MS, TransactionList } from "./transaction-list";

afterEach(cleanup);

/*
  Relógio falso: o botão de excluir só confirma depois de dois segundos de dedo
  preso, e esperar isso de verdade custaria quatro segundos nesta suíte.
*/
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** `act` porque quem muda o estado é o callback do timer, e não um evento. */
async function segurar(botao: HTMLElement, ms: number) {
  fireEvent.pointerDown(botao);
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

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
    recurrenceId: null,
    occurrenceKey: null,
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
      kind: "expense",
      deleted: false,
      materialized: true,
      fieldHlc: {},
    },
    "cat-apagada": {
      id: "cat-apagada",
      name: "Antiga",
      icon: "tag",
      color: "slate",
      kind: "expense",
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
    render(
      <TransactionList
        items={ITEMS}
        state={STATE}
        today="2026-08-08"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Mercado")).toBeDefined();
    expect(screen.getByText("Salário")).toBeDefined();
  });

  it("avisa quando não há lançamentos", () => {
    const { container } = render(
      <TransactionList
        items={[]}
        state={STATE}
        today="2026-08-08"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /Nenhum lançamento ainda/i })).toBeDefined();
    expect(container.querySelector('img[src*="undraw_enter-payment-info"]')).not.toBeNull();
  });

  it("pede edição do registro clicado", () => {
    const onEdit = vi.fn();
    render(
      <TransactionList
        items={ITEMS}
        state={STATE}
        today="2026-08-08"
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar Salário" }));

    expect(onEdit).toHaveBeenCalledWith(ITEMS[1]);
  });

  it("nao exclui com um toque solto", async () => {
    const onDelete = vi.fn();
    render(
      <TransactionList
        items={ITEMS}
        state={STATE}
        today="2026-08-08"
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    const botao = screen.getByRole("button", { name: "Excluir Mercado (segure para confirmar)" });
    fireEvent.pointerDown(botao);
    fireEvent.pointerUp(botao);
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS * 2);
    });

    // É este caso que a exclusão sem desfazer existe para impedir: o dedo que
    // encostou no alvo errado e saiu.
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("exclui o registro depois de segurar o botao", async () => {
    const onDelete = vi.fn();
    render(
      <TransactionList
        items={ITEMS}
        state={STATE}
        today="2026-08-08"
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await segurar(
      screen.getByRole("button", { name: "Excluir Mercado (segure para confirmar)" }),
      HOLD_MS,
    );

    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("distingue receita de despesa no valor exibido", () => {
    render(
      <TransactionList
        items={ITEMS}
        state={STATE}
        today="2026-08-08"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

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
        today="2026-08-08"
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

describe("autoria", () => {
  const AUTOR = "01J9F3K2M7QX8YB4TVWZ0DCEHU";

  const COM_AUTOR: ProjectionState = {
    ...STATE,
    users: {
      [AUTOR]: {
        id: AUTOR,
        name: "Luiz",
        color: "teal",
        avatar: "data:image/webp;base64,AAAA",
        deleted: false,
        materialized: true,
        fieldHlc: {},
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
        onDelete={vi.fn()}
      />,
    );
    return screen.getByRole("listitem");
  }

  it("a cor do autor e marca lateral, nao fundo do item", () => {
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
});

describe("agrupamento por dia", () => {
  const HOJE = "2026-08-10";

  function comItens(items: TransactionRecord[]) {
    render(
      <TransactionList
        items={items}
        state={STATE}
        today={HOJE}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
  }

  it("um cabecalho por dia, com o rotulo relativo", () => {
    comItens([
      record({ id: "a", occurredOn: HOJE }),
      record({ id: "b", occurredOn: "2026-08-09" }),
      record({ id: "c", occurredOn: "2026-08-05" }),
    ]);

    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Hoje",
      "Ontem",
      "05 de agosto",
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

    expect(screen.getByTestId("day-total").textContent).toContain("2.790,00");
  });

  it("nao mostra subtotal num dia de um lancamento so", () => {
    // Repetiria o valor da linha logo abaixo, palavra por palavra.
    comItens([record({ id: "a", occurredOn: HOJE })]);

    expect(screen.queryByTestId("day-total")).toBeNull();
  });
});

describe("ancora visual da linha", () => {
  function comCategoria(over: Partial<TransactionRecord>) {
    render(
      <TransactionList
        items={[record({ id: "a", ...over })]}
        state={STATE}
        today="2026-08-08"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
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

  it("a marca de autoria e uma pilula recuada, nao faixa ate a borda", () => {
    // A lista tem raio de 1rem: faixa em esquadro contra o canto arredondado le
    // como defeito no primeiro e no ultimo item.
    comCategoria({});

    const marca = screen.getByTestId("author-mark");
    expect(marca.className).toContain("rounded-full");
    expect(marca.className).toContain("absolute");
  });
});
