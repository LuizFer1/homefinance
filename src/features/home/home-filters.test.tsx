import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALIVE } from "../../domain/model/row.fake";
import { stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { HomePage } from "./home-page";

afterEach(cleanup);

const CAT = "cat-alimentacao";

const state = {
  ...stateOf({
    transactions: [
      tx("a", "expense", 1_000, "2026-09-05", CAT, { description: "Padária Pão Quente" }),
      tx("b", "expense", 2_000, "2026-09-06", null, { description: "Mercado" }),
      tx("c", "income", 9_000, "2026-09-07", null, { description: "Salário" }),
      tx("d", "expense", 500, "2026-09-08", CAT, {
        description: "Padaria do Zé",
        reportState: "hidden",
      }),
    ],
  }),
  categories: {
    [CAT]: {
      ...ALIVE,
      id: CAT,
      name: "Alimentação",
      icon: "utensils",
      color: "sky" as const,
      kind: "expense" as const,
    },
  },
};

function renderHome(items = Object.values(state.transactions)) {
  render(
    <HomePage
      items={items}
      state={state}
      profile={null}
      today="2026-09-20"
      hour={10}
      onCompose={vi.fn()}
      onImport={vi.fn()}
      onEdit={vi.fn()}
      onConfirm={vi.fn()}
      onOpenProfile={vi.fn()}
    />,
  );
}

const search = (value: string) =>
  fireEvent.input(screen.getByLabelText("Buscar lançamentos"), { target: { value } });

const rows = () => screen.queryAllByRole("button", { name: /^Editar / }).map((b) => b.textContent);

describe("busca na Início", () => {
  it("sem filtro mostra o mês e todas as linhas", () => {
    renderHome();
    expect(screen.getByRole("region", { name: /Resumo de/ })).toBeDefined();
    expect(screen.queryByRole("region", { name: "Resultado do filtro" })).toBeNull();
    expect(rows()).toHaveLength(4);
  });

  it("'padaria' acha 'Padária' e 'Padaria', e o selo do oculto continua na linha", () => {
    renderHome();
    search("padaria");

    expect(rows()).toHaveLength(2);
    expect(screen.getByText("Oculto")).toBeDefined();
  });

  it("o saldo do filtro soma só o que conta e troca o resumo do mês", () => {
    renderHome();
    search("padaria");

    const summary = screen.getByRole("region", { name: "Resultado do filtro" });
    expect(within(summary).getByText("Saldo do filtro")).toBeDefined();
    // R$ 10 da primeira; os R$ 5 do oculto ficam fora.
    expect(screen.getByTestId("filter-balance").textContent).toContain("10,00");
    expect(summary.textContent).toContain("2 lançamentos");
    expect(screen.queryByRole("region", { name: /Resumo de/ })).toBeNull();
  });

  it("sem resultado mostra 'Nada encontrado', e limpar devolve a lista", () => {
    renderHome();
    search("xyz");

    expect(screen.getByRole("heading", { name: "Nada encontrado" })).toBeDefined();
    expect(screen.queryByText("Nenhum lançamento ainda")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Limpar busca e filtros" }));
    expect(rows()).toHaveLength(4);
    expect(screen.queryByRole("heading", { name: "Nada encontrado" })).toBeNull();
  });

  it("sem lançamento algum não mostra a busca: vale o estado vazio", () => {
    renderHome([]);
    expect(screen.queryByLabelText("Buscar lançamentos")).toBeNull();
    expect(screen.getByRole("heading", { name: "Nenhum lançamento ainda" })).toBeDefined();
  });
});

describe("filtros", () => {
  it("combina categoria e tipo pela folha, mostra chips e remove um a um", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));

    fireEvent.click(screen.getByRole("radio", { name: "Despesas" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(screen.getByRole("radio", { name: "Alimentação" }));
    // Nada muda atrás do sheet até "Filtrar".
    expect(rows()).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(rows()).toHaveLength(2);
    const chips = screen.getByRole("list", { name: "Filtros ativos" });
    expect(within(chips).getAllByRole("button", { name: /^Remover filtro/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remover filtro Despesas" }));
    expect(screen.queryByRole("button", { name: "Remover filtro Despesas" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remover filtro Alimentação" })).toBeDefined();
  });

  it("'Sem categoria' recorta o que não tem categoria", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(screen.getByRole("radio", { name: "Sem categoria" }));
    fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(rows()).toHaveLength(2);
    expect(screen.getAllByText("Sem categoria").length).toBeGreaterThan(0);
  });

  it("navega pelas três etapas com as setas e pela barra de progresso", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));

    expect(screen.getByRole("radio", { name: "Receitas" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Etapa anterior" }).hasAttribute("disabled")).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    expect(screen.getByRole("radio", { name: "Todas" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    expect(screen.getByRole("radio", { name: "Sem forma de pagamento" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Próxima etapa" }).hasAttribute("disabled")).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tipo" }));
    expect(screen.getByRole("radio", { name: "Receitas" })).toBeDefined();
  });

  it("Limpar zera a escolha do rascunho sem mexer na lista", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(screen.getByRole("radio", { name: "Receitas" }));
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect((screen.getByRole("radio", { name: "Todos" }) as HTMLInputElement).checked).toBe(true);
    expect(rows()).toHaveLength(4);
  });
});
