import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./app";
import type { EventStore } from "./data/event-store";
import type { DomainEvent } from "./domain/events/types";
import { createRegistryStore, type RegistryStore } from "./features/registry/store";
import { createSession } from "./features/session/session";
import { createTransactionsStore, type TransactionsStore } from "./features/transactions/store";

afterEach(cleanup);

function fakeEventStore() {
  const meta = new Map<string, string>();
  const events: DomainEvent[] = [];
  const store: EventStore & { events: DomainEvent[] } = {
    events,
    append: async (event) => {
      events.push(event);
    },
    readAll: async () => [...events].sort((a, b) => (a.hlc < b.hlc ? -1 : 1)),
    getMeta: async (key) => meta.get(key) ?? null,
    setMeta: async (key, value) => {
      meta.set(key, value);
    },
  };
  return store;
}

/** As duas stores partilham a mesma sessao, como em producao. */
function buildStores(events: EventStore): { store: TransactionsStore; registry: RegistryStore } {
  let millis = 1_754_697_600_000;
  const session = createSession({
    events,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count: number) => Array.from({ length: count }, (_, index) => index % 32),
  });
  return { store: createTransactionsStore(session), registry: createRegistryStore(session) };
}

/** O tema escreve num documento à parte para não sujar o do testing-library. */
function fakeTheme() {
  const map = new Map<string, string>();
  return {
    storage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    },
    doc: document.implementation.createHTMLDocument("tema"),
  };
}

/**
 * O mesmo destino existe na fila de acoes e na barra inferior. As consultas
 * precisam dizer qual, senao ficam ambiguas.
 */
function naBarra() {
  return within(screen.getByRole("navigation", { name: "Seções" }));
}

function naFila() {
  return within(screen.getByRole("navigation", { name: "Ações rápidas" }));
}

/** Abre o modal pelo botao flutuante e espera a primeira etapa aparecer. */
async function abrirModal() {
  fireEvent.click(screen.getByRole("button", { name: "Novo lançamento" }));
  await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
}

/** Avanca as tres etapas da wizard e salva. */
function concluirWizard() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: /adicionar|salvar/i }));
}

async function addTransaction(description: string, amount: string) {
  await abrirModal();
  fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: description } });
  fireEvent.input(screen.getByLabelText("Valor"), { target: { value: amount } });
  concluirWizard();
  await waitFor(() => expect(screen.getByText(description)).toBeDefined());
}

/** Abre a edicao tocando no lancamento e espera o modal. */
async function abrirEdicao(description: string) {
  fireEvent.click(screen.getByRole("button", { name: `Editar ${description}` }));
  await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
}

describe("App", () => {
  it("mostra o nome do app como cabeçalho", async () => {
    render(
      <App {...buildStores(fakeEventStore())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "HomeFinance" })).toBeDefined());
  });

  it("adiciona um lançamento e atualiza os totais", async () => {
    render(
      <App {...buildStores(fakeEventStore())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() => expect(screen.getByTestId("total-expense")).toBeDefined());

    await addTransaction("Mercado", "12,34");

    expect(screen.getByTestId("total-expense").textContent).toContain("12,34");
  });

  it("edita emitindo patch apenas do campo alterado", async () => {
    const events = fakeEventStore();
    render(<App {...buildStores(events)} today="2026-08-08" hour={9} theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByTestId("total-expense")).toBeDefined());
    await addTransaction("Mercado", "12,34");

    await abrirEdicao("Mercado");
    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "5,00" } });
    concluirWizard();

    await waitFor(() =>
      expect(events.events.some((event) => event.action === "update")).toBe(true),
    );
    const update = events.events.find((event) => event.action === "update");
    expect(update?.data).toEqual({ amountMinor: 500 });
  });

  it("não emite evento quando nada mudou na edição", async () => {
    const events = fakeEventStore();
    render(<App {...buildStores(events)} today="2026-08-08" hour={9} theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByTestId("total-expense")).toBeDefined());
    await addTransaction("Mercado", "12,34");

    await abrirEdicao("Mercado");
    concluirWizard();

    // Modal fecha sem emitir: o patch sai vazio e um log append-only nao merece
    // lixo permanente.
    await waitFor(() => expect(screen.queryByLabelText("Descrição")).toBeNull());
    expect(events.events.filter((event) => event.action === "update")).toHaveLength(0);
  });

  it("remove o lançamento da lista", async () => {
    render(
      <App {...buildStores(fakeEventStore())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() => expect(screen.getByTestId("total-expense")).toBeDefined());
    await addTransaction("Mercado", "12,34");

    fireEvent.click(screen.getByRole("button", { name: "Excluir Mercado" }));

    await waitFor(() => expect(screen.getByText("Nenhum lançamento ainda.")).toBeDefined());
  });

  it("mostra erro quando o armazenamento não abre", async () => {
    const broken = fakeEventStore();
    broken.readAll = async () => {
      throw new Error("IndexedDB indisponível");
    };
    render(<App {...buildStores(broken)} today="2026-08-08" hour={9} theme={fakeTheme()} />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("IndexedDB indisponível"),
    );
  });
});

describe("navegacao", () => {
  it("troca para categorias e volta para lancamentos", async () => {
    render(
      <App {...buildStores(fakeEventStore())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() => expect(screen.getByTestId("total-expense")).toBeDefined());

    fireEvent.click(naBarra().getByRole("button", { name: "Categorias" }));
    expect(screen.getByRole("region", { name: "Categorias" })).toBeDefined();
    expect(screen.queryByTestId("total-expense")).toBeNull();

    fireEvent.click(naBarra().getByRole("button", { name: "Início" }));
    expect(screen.getByTestId("total-expense")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Categorias" })).toBeNull();
  });

  it("cadastra categoria e volta com o lancamento intacto", async () => {
    // O ciclo que a fatia inteira existe para permitir: sair da tela de
    // lancamentos, cadastrar, e voltar sem perder nada — as duas telas leem a
    // mesma projecao.
    const events = fakeEventStore();
    render(<App {...buildStores(events)} today="2026-08-08" hour={9} theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByTestId("total-expense")).toBeDefined());
    await addTransaction("Mercado", "12,34");

    fireEvent.click(naBarra().getByRole("button", { name: "Categorias" }));
    fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    fireEvent.input(screen.getByLabelText(/nome/i), { target: { value: "Alimentacao" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(screen.getByText("Alimentacao")).toBeDefined());

    fireEvent.click(naBarra().getByRole("button", { name: "Início" }));

    expect(screen.getByTestId("total-expense").textContent).toContain("12,34");
    expect(events.events.map((e) => e.entity).sort()).toEqual(["category", "transaction"]);
  });

  it("a tela de pagamentos oferece o tipo e a de categorias nao", async () => {
    render(
      <App {...buildStores(fakeEventStore())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() => expect(screen.getByTestId("total-expense")).toBeDefined());

    fireEvent.click(naBarra().getByRole("button", { name: "Categorias" }));
    fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    expect(screen.queryByLabelText(/tipo de pagamento/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    fireEvent.click(naBarra().getByRole("button", { name: "Pagamentos" }));
    fireEvent.click(screen.getByRole("button", { name: "Nova forma de pagamento" }));
    expect(screen.getByLabelText(/tipo de pagamento/i)).toBeDefined();
  });
});

describe("modal de lançamento", () => {
  async function pronto() {
    render(
      <App {...buildStores(fakeEventStore())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() => expect(screen.getByTestId("total-expense")).toBeDefined());
  }

  it("o formulário não fica na tela até o botão ser tocado", async () => {
    // A tela principal e a lista. O formulario so aparece quando pedido — e o
    // que libera espaco vertical num celular.
    await pronto();

    expect(screen.queryByLabelText("Descrição")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Novo lançamento" }));

    expect(screen.getByLabelText("Descrição")).toBeDefined();
  });

  it("fechar descarta o rascunho sem gravar nada", async () => {
    await pronto();
    await abrirModal();
    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Nao vai" } });

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(screen.queryByLabelText("Descrição")).toBeNull());
    expect(screen.queryByText("Nao vai")).toBeNull();
  });

  it("reabrir depois de fechar começa limpo", async () => {
    // A wizard e montada so enquanto o modal esta aberto, com key. Sem isso o
    // rascunho abandonado reapareceria no proximo lancamento.
    await pronto();
    await abrirModal();
    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await abrirModal();

    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("");
  });

  it("o botão flutuante só existe na tela de lançamentos", async () => {
    await pronto();
    expect(screen.getByRole("button", { name: "Novo lançamento" })).toBeDefined();

    fireEvent.click(naBarra().getByRole("button", { name: "Categorias" }));

    expect(screen.queryByRole("button", { name: "Novo lançamento" })).toBeNull();
  });

  it("salvar fecha o modal e mostra o lançamento na lista", async () => {
    await pronto();

    await addTransaction("Padaria", "9,90");

    expect(screen.queryByLabelText("Descrição")).toBeNull();
    expect(screen.getByText("Padaria")).toBeDefined();
  });
});

describe("fila de ações rápidas", () => {
  async function pronto() {
    render(
      <App {...buildStores(fakeEventStore())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() => expect(screen.getByTestId("total-expense")).toBeDefined());
  }

  it("saúda conforme a hora injetada", async () => {
    await pronto();

    expect(screen.getByRole("heading", { name: "Bom dia" })).toBeDefined();
  });

  it("Despesa abre o modal já em despesa", async () => {
    // Economiza um toque no caso mais comum: o tipo ja vem escolhido.
    await pronto();

    fireEvent.click(naFila().getByRole("button", { name: "Despesa" }));

    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    expect((screen.getByRole("radio", { name: "Despesa" }) as HTMLInputElement).checked).toBe(true);
  });

  it("Receita abre o modal já em receita", async () => {
    await pronto();

    fireEvent.click(naFila().getByRole("button", { name: "Receita" }));

    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    expect((screen.getByRole("radio", { name: "Receita" }) as HTMLInputElement).checked).toBe(true);
  });

  it("Categorias e Pagamentos navegam em vez de abrir o modal", async () => {
    await pronto();

    fireEvent.click(naFila().getByRole("button", { name: "Categorias" }));

    expect(screen.getByRole("region", { name: "Categorias" })).toBeDefined();
    expect(screen.queryByLabelText("Descrição")).toBeNull();
  });

  it("a fila some fora da tela de lançamentos", async () => {
    await pronto();

    fireEvent.click(naBarra().getByRole("button", { name: "Categorias" }));

    expect(screen.queryByRole("navigation", { name: "Ações rápidas" })).toBeNull();
  });

  it("o botão flutuante cria o que a tela lista", async () => {
    // Um padrao so no app inteiro: o + sempre cria o que esta na tela.
    await pronto();
    expect(screen.getByRole("button", { name: "Novo lançamento" })).toBeDefined();

    fireEvent.click(naBarra().getByRole("button", { name: "Categorias" }));
    expect(screen.getByRole("button", { name: "Nova categoria" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Novo lançamento" })).toBeNull();

    fireEvent.click(naBarra().getByRole("button", { name: "Pagamentos" }));
    expect(screen.getByRole("button", { name: "Nova forma de pagamento" })).toBeDefined();
  });

  it("o tipo escolhido na fila não vaza para a próxima abertura", async () => {
    // A wizard e remontada por key a cada abertura. Sem isso, abrir por Receita
    // e depois pelo botao flutuante manteria receita selecionada.
    await pronto();
    fireEvent.click(naFila().getByRole("button", { name: "Receita" }));
    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    fireEvent.click(naFila().getByRole("button", { name: "Despesa" }));

    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    expect((screen.getByRole("radio", { name: "Despesa" }) as HTMLInputElement).checked).toBe(true);
  });
});
