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
    render(<DashboardPage items={[]} state={stateWith()} today={TODAY} />);

    expect(screen.getByText(/Nenhum lançamento ainda/)).toBeDefined();
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
});
