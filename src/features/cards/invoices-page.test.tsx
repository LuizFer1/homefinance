import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { card, legacyCard, purchase, world } from "../../domain/cards/fixtures.fake";
import { InvoicesPage } from "./invoices-page";

afterEach(cleanup);

const nu = card("nu", { name: "Nubank", closingDay: 5, dueDay: 12 });

function montar(state = world({ methods: [nu] }), extra: Record<string, () => void> = {}) {
  render(<InvoicesPage state={state} today="2026-10-10" onBack={vi.fn()} {...extra} />);
}

describe("InvoicesPage", () => {
  it("rotula a fatura aberta como estimativa e lista as anteriores", () => {
    montar(
      world({
        methods: [nu],
        transactions: [
          purchase("a", "nu", "2026-09-20", 10_000),
          purchase("b", "nu", "2026-10-06", 4_000),
        ],
      }),
    );

    const invoices = screen.getAllByTestId("invoice");
    expect(invoices.map((i) => i.getAttribute("data-status"))).toEqual(["open", "closed"]);
    expect(within(invoices[0] as HTMLElement).getByTestId("invoice-estimate")).toBeDefined();
    expect(invoices[0]?.textContent).toContain("Fatura de nov · aberta");
    expect(invoices[0]?.textContent).toContain("Fecha 5 nov · vence 12 nov");
    expect(invoices[1]?.textContent).toContain("Fatura de out");
    expect(within(invoices[1] as HTMLElement).queryByTestId("invoice-estimate")).toBeNull();
  });

  it("a aberta já vem com as compras; a fechada abre ao tocar", () => {
    montar(
      world({
        methods: [nu],
        transactions: [
          purchase("a", "nu", "2026-09-20", 10_000, { description: "Mercado" }),
          purchase("b", "nu", "2026-10-06", 4_000, { description: "Farmácia" }),
        ],
      }),
    );

    expect(screen.getByText("Farmácia")).toBeDefined();
    expect(screen.queryByText("Mercado")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Fatura de out\b/ }));

    expect(screen.getByText("Mercado")).toBeDefined();
  });

  it("sem cartão completo, explica e leva ao cadastro", () => {
    const onOpenPayments = vi.fn();
    montar(world({ methods: [] }), { onOpenPayments });

    expect(screen.getByText("Nenhum cartão cadastrado")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar cartão" }));
    expect(onOpenPayments).toHaveBeenCalledOnce();
  });

  it("cartão por completar fica fora das faturas e é nomeado à parte", () => {
    montar(world({ methods: [nu, legacyCard("velho", { name: "Antigo" })] }));

    expect(screen.getAllByTestId("card-invoices")).toHaveLength(1);
    expect(screen.getByText(/Sem fatura por falta de dados: Antigo/)).toBeDefined();
  });

  it("avisa dos lançamentos em cartão por completar e abre o ajuste", () => {
    const onFixCards = vi.fn();
    montar(
      world({
        methods: [nu, legacyCard("velho")],
        transactions: [purchase("a", "velho", "2026-10-02"), purchase("b", "velho", "2026-10-03")],
      }),
      { onFixCards },
    );

    expect(screen.getByTestId("cards-pending").textContent).toContain(
      "2 lançamentos em cartões por completar",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ajustar cartões" }));
    expect(onFixCards).toHaveBeenCalledOnce();
  });

  it("sem pendência, não há aviso", () => {
    montar();
    expect(screen.queryByTestId("cards-pending")).toBeNull();
  });

  it("uma fatura por cartão: dois cartões, dois blocos", () => {
    montar(world({ methods: [nu, card("itau", { name: "Itaú" })] }));
    expect(screen.getAllByTestId("card-invoices")).toHaveLength(2);
  });
});
