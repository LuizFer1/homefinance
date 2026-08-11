import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import {
  type CategoryRecord,
  EMPTY_STATE,
  type ProjectionState,
  type TransactionRecord,
} from "../../domain/projections/apply";
import { DashboardPage } from "./dashboard-page";

afterEach(cleanup);

const TODAY = "2026-08-10";

function record(overrides: Partial<TransactionRecord> & { id: string }): TransactionRecord {
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
    deleted: false,
    materialized: true,
    fieldHlc: {},
    ...overrides,
  };
}

function stateWith(categories: CategoryRecord[] = []): ProjectionState {
  return {
    ...EMPTY_STATE,
    categories: Object.fromEntries(categories.map((item) => [item.id, item])),
  };
}

describe("DashboardPage", () => {
  it("diz quando não há lançamento nenhum", () => {
    const { container } = render(
      <DashboardPage items={[]} state={stateWith()} today={TODAY} />,
    );

    expect(screen.getByRole("heading", { name: /Nenhum lançamento ainda/i })).toBeDefined();
    expect(container.querySelector('img[src*="undraw_budgeting_light"]')).not.toBeNull();
  });

  it("com dados nao mostra a ilustracao de vazio", () => {
    const { container } = render(
      <DashboardPage items={[record({ id: "a" })]} state={stateWith()} today={TODAY} />,
    );

    expect(container.querySelector('img[src*="undraw_budgeting"]')).toBeNull();
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

    expect(saldo.className).toContain("text-error");
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

    expect(screen.getByTestId("dashboard-balance").className).not.toContain("text-error");
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
});
