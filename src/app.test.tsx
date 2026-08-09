import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
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

async function addTransaction(description: string, amount: string) {
  fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: description } });
  fireEvent.input(screen.getByLabelText("Valor"), { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  await waitFor(() => expect(screen.getByText(description)).toBeDefined());
}

describe("App", () => {
  it("mostra o nome do app como cabeçalho", async () => {
    render(<App {...buildStores(fakeEventStore())} today="2026-08-08" theme={fakeTheme()} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "HomeFinance" })).toBeDefined());
  });

  it("adiciona um lançamento e atualiza os totais", async () => {
    render(<App {...buildStores(fakeEventStore())} today="2026-08-08" theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());

    await addTransaction("Mercado", "12,34");

    expect(screen.getByTestId("total-expense").textContent).toContain("12,34");
  });

  it("edita emitindo patch apenas do campo alterado", async () => {
    const events = fakeEventStore();
    render(<App {...buildStores(events)} today="2026-08-08" theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    await addTransaction("Mercado", "12,34");

    fireEvent.click(screen.getByRole("button", { name: "Editar Mercado" }));
    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "5,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(events.events.some((event) => event.action === "update")).toBe(true),
    );
    const update = events.events.find((event) => event.action === "update");
    expect(update?.data).toEqual({ amountMinor: 500 });
  });

  it("não emite evento quando nada mudou na edição", async () => {
    const events = fakeEventStore();
    render(<App {...buildStores(events)} today="2026-08-08" theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    await addTransaction("Mercado", "12,34");

    fireEvent.click(screen.getByRole("button", { name: "Editar Mercado" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Adicionar" })).toBeDefined());
    expect(events.events.filter((event) => event.action === "update")).toHaveLength(0);
  });

  it("remove o lançamento da lista", async () => {
    render(<App {...buildStores(fakeEventStore())} today="2026-08-08" theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    await addTransaction("Mercado", "12,34");

    fireEvent.click(screen.getByRole("button", { name: "Excluir Mercado" }));

    await waitFor(() => expect(screen.getByText("Nenhum lançamento ainda.")).toBeDefined());
  });

  it("mostra erro quando o armazenamento não abre", async () => {
    const broken = fakeEventStore();
    broken.readAll = async () => {
      throw new Error("IndexedDB indisponível");
    };
    render(<App {...buildStores(broken)} today="2026-08-08" theme={fakeTheme()} />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("IndexedDB indisponível"),
    );
  });
});

describe("navegacao", () => {
  it("troca para categorias e volta para lancamentos", async () => {
    render(<App {...buildStores(fakeEventStore())} today="2026-08-08" theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Categorias" }));
    expect(screen.getByRole("region", { name: "Categorias" })).toBeDefined();
    expect(screen.queryByTestId("total-expense")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Lancamentos" }));
    expect(screen.getByTestId("total-expense")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Categorias" })).toBeNull();
  });

  it("cadastra categoria e volta com o lancamento intacto", async () => {
    // O ciclo que a fatia inteira existe para permitir: sair da tela de
    // lancamentos, cadastrar, e voltar sem perder nada — as duas telas leem a
    // mesma projecao.
    const events = fakeEventStore();
    render(<App {...buildStores(events)} today="2026-08-08" theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    await addTransaction("Mercado", "12,34");

    fireEvent.click(screen.getByRole("button", { name: "Categorias" }));
    fireEvent.input(screen.getByLabelText(/nome/i), { target: { value: "Alimentacao" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(screen.getByText("Alimentacao")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Lancamentos" }));

    expect(screen.getByTestId("total-expense").textContent).toContain("12,34");
    expect(events.events.map((e) => e.entity).sort()).toEqual(["category", "transaction"]);
  });

  it("a tela de pagamentos oferece o tipo e a de categorias nao", async () => {
    render(<App {...buildStores(fakeEventStore())} today="2026-08-08" theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Categorias" }));
    expect(screen.queryByLabelText(/tipo de pagamento/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pagamentos" }));
    expect(screen.getByLabelText(/tipo de pagamento/i)).toBeDefined();
  });
});
