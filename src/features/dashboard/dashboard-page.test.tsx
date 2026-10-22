import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../../domain/model/app-state";
import type { Category } from "../../domain/model/category";
import { ALIVE } from "../../domain/model/row.fake";
import type { Transaction } from "../../domain/model/transaction";
import { DashboardPage } from "./dashboard-page";

afterEach(cleanup);

const TODAY = "2026-08-10";

function record(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    kind: "expense",
    description: "Mercado",
    amountMinor: 1000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: TODAY,
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
    ...ALIVE,
    ...overrides,
  };
}

function stateWith(categories: Category[] = []): AppState {
  return {
    ...EMPTY_APP_STATE,
    categories: Object.fromEntries(categories.map((item) => [item.id, item])),
  };
}

describe("DashboardPage", () => {
  it("diz quando não há lançamento nenhum", () => {
    const { container } = render(<DashboardPage items={[]} state={stateWith()} today={TODAY} />);

    expect(screen.getByRole("heading", { name: "O resumo de agosto aparece aqui" })).toBeDefined();
    // Esqueleto tracejado no lugar da ilustração genérica.
    expect(container.querySelector("img")).toBeNull();
  });

  it("com dados nao mostra a ilustracao de vazio", () => {
    const { container } = render(
      <DashboardPage items={[record({ id: "a" })]} state={stateWith()} today={TODAY} />,
    );

    expect(container.querySelector("img")).toBeNull();
  });

  it("anuncia o mês por extenso", () => {
    render(<DashboardPage items={[record({ id: "a" })]} state={stateWith()} today={TODAY} />);

    expect(screen.getByText("agosto de 2026")).toBeDefined();
  });

  it("distingue mês sem despesa de mês sem lançamento", () => {
    // Quem só lançou receita tem um dashboard com números e uma rosca vazia;
    // a linha explica por quê em vez de deixar um buraco na tela.
    render(
      <DashboardPage
        items={[record({ id: "a", kind: "income", amountMinor: 5000 })]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    expect(screen.getByText(/Nenhuma despesa em agosto de 2026/)).toBeDefined();
  });

  it("deixa fora do mês o que aconteceu em outro mês, mas mantém nas barras", () => {
    render(
      <DashboardPage
        items={[
          record({ id: "a", amountMinor: 1000, occurredOn: "2026-08-05" }),
          record({ id: "b", amountMinor: 7000, occurredOn: "2026-06-05" }),
        ]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    // Só a despesa de agosto entra no total do mês...
    expect(screen.getByTestId("total-expense").textContent).toContain("10,00");
    expect(screen.getByTestId("total-expense").textContent).not.toContain("70,00");
    // ...mas junho continua na série de seis meses.
    expect(screen.getByTestId("bar-expense-2026-06")).toBeDefined();
  });

  it("chama o saldo de saldo do mês, e não do período", () => {
    render(<DashboardPage items={[record({ id: "a" })]} state={stateWith()} today={TODAY} />);

    expect(screen.getByText("Saldo do mês")).toBeDefined();
  });

  it("diz que não houve movimento em seis meses", () => {
    // Lançamento de 2020 existe, então não é o vazio geral — mas está fora da
    // janela, e a série inteira sai zerada.
    render(
      <DashboardPage
        items={[record({ id: "a", occurredOn: "2020-01-05" })]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    expect(screen.getByText(/Sem movimento nos últimos seis meses/)).toBeDefined();
  });

  it("marca o saldo do mês em vermelho quando fecha negativo", () => {
    // A única cor com significado nesta tela. Sem teste, uma refatoração de
    // classes a apagaria sem nada acusar.
    render(
      <DashboardPage
        items={[
          record({ id: "a", amountMinor: 9000 }),
          record({ id: "b", kind: "income", amountMinor: 1000 }),
        ]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    const saldo = screen.getByTestId("dashboard-balance");

    expect(saldo.className).toContain("text-expense-fg");
    expect(saldo.textContent).toContain("80,00");
  });

  it("não pinta o saldo quando o mês fecha positivo", () => {
    render(
      <DashboardPage
        items={[record({ id: "a", kind: "income", amountMinor: 5000 })]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    expect(screen.getByTestId("dashboard-balance").className).not.toContain("text-expense-fg");
  });

  it("mostra os vazios do mês e da série juntos quando o histórico está fora da janela", () => {
    // Decisão registrada, não acidente: as duas frases falam de recortes
    // diferentes e nenhuma cede lugar para a outra.
    render(
      <DashboardPage
        items={[record({ id: "a", occurredOn: "2020-01-05" })]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    expect(screen.getByText(/Nenhuma despesa em agosto de 2026/)).toBeDefined();
    expect(screen.getByText(/Sem movimento nos últimos seis meses/)).toBeDefined();
    expect(screen.getByText(/0 lançamentos no mês/)).toBeDefined();
  });

  it("conta lançamento datado para frente, desde que no mês corrente", () => {
    // O recorte é por prefixo de mês, não uma comparação com hoje: uma conta
    // agendada para o dia 28 já pesa no mês em que vai ser paga.
    render(
      <DashboardPage
        items={[record({ id: "a", amountMinor: 4000, occurredOn: "2026-08-28" })]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    expect(screen.getByTestId("total-expense").textContent).toContain("40,00");
  });

  it("o seletor de mês recalcula os cards e não anda para o futuro", () => {
    render(
      <DashboardPage
        items={[
          record({ id: "a", amountMinor: 1000, occurredOn: "2026-08-05" }),
          record({ id: "b", amountMinor: 7000, occurredOn: "2026-07-05" }),
        ]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    expect(screen.getByRole("button", { name: "Próximo mês" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));

    expect(screen.getByText("julho de 2026")).toBeDefined();
    expect(screen.getByTestId("total-expense").textContent).toContain("70,00");
  });

  it("compara o saldo com o mês anterior", () => {
    render(
      <DashboardPage
        items={[
          record({ id: "a", kind: "income", amountMinor: 50_000, occurredOn: "2026-08-02" }),
          record({ id: "b", kind: "income", amountMinor: 8800, occurredOn: "2026-07-02" }),
        ]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    expect(screen.getByText(/412,00 a mais que julho/)).toBeDefined();
  });

  it("o ritmo compara com o mesmo dia do mês anterior", () => {
    render(
      <DashboardPage
        items={[
          record({ id: "a", amountMinor: 9200, occurredOn: "2026-08-03" }),
          record({ id: "b", amountMinor: 10_000, occurredOn: "2026-07-04" }),
          record({ id: "c", amountMinor: 99_999, occurredOn: "2026-07-25" }),
        ]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    expect(screen.getByText(/até o dia 10/)).toBeDefined();
    expect(screen.getByText(/8% abaixo/)).toBeDefined();
  });

  it("para onde foi lista as categorias com a parte de cada uma", () => {
    const casa: Category = {
      id: "casa",
      name: "Moradia",
      icon: "house",
      color: "amber",
      kind: "expense",
      ...ALIVE,
    };
    render(
      <DashboardPage
        items={[
          record({ id: "a", amountMinor: 7500, categoryId: "casa" }),
          record({ id: "b", amountMinor: 2500 }),
        ]}
        state={stateWith([casa])}
        today={TODAY}
      />,
    );

    expect(screen.getByText("2 categorias")).toBeDefined();
    expect(screen.getByText("75%")).toBeDefined();
    expect(screen.getByText("Sem categoria")).toBeDefined();
  });

  describe("mapa de calor", () => {
    const month = [
      record({ id: "a", occurredOn: "2026-08-03", amountMinor: 10_000 }),
      record({ id: "b", occurredOn: "2026-08-03", amountMinor: 20_000, description: "Feira" }),
      record({ id: "c", occurredOn: "2026-08-05", amountMinor: 5_000 }),
      record({ id: "t", occurredOn: "2026-08-06", amountMinor: 99_000, reportState: "transfer" }),
    ];

    it("mostra a intensidade e os tres numeros de apoio", () => {
      render(<DashboardPage items={month} state={stateWith()} today={TODAY} />);

      expect(screen.getByTestId("heat-day-3").getAttribute("data-level")).toBe("4");
      expect(screen.getByTestId("heat-day-5").getAttribute("data-level")).toBe("1");
      // A transferência não conta: o dia 6 fica sem saída.
      expect(screen.getByTestId("heat-day-6").getAttribute("data-level")).toBe("0");
      // Até o dia 10: 350 / 10 = 35 por dia; saídas em 2 dias, 8 sem saída.
      expect(screen.getByTestId("heat-average").textContent).toContain("35");
      expect(screen.getByTestId("heat-peak").textContent).toContain("300");
      expect(screen.getByTestId("heat-empty").textContent).toBe("8");
    });

    it("tocar no dia lista os lancamentos dele", () => {
      render(<DashboardPage items={month} state={stateWith()} today={TODAY} />);

      fireEvent.click(screen.getByTestId("heat-day-3"));

      expect(screen.getByRole("button", { name: "Editar Feira" })).toBeDefined();
      expect(screen.getByText(/2 saídas/)).toBeDefined();
    });

    it("tocar numa linha do dia abre a edicao", () => {
      const edited: string[] = [];
      render(
        <DashboardPage
          items={month}
          state={stateWith()}
          today={TODAY}
          onEdit={(row) => edited.push(row.id)}
        />,
      );

      fireEvent.click(screen.getByTestId("heat-day-3"));
      fireEvent.click(screen.getByRole("button", { name: "Editar Feira" }));

      expect(edited).toEqual(["b"]);
    });
  });
});
