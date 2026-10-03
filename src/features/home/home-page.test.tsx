import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { movement, reserve, stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { HomePage } from "./home-page";

afterEach(cleanup);

function renderHome(parts: Parameters<typeof stateOf>[0]) {
  const state = stateOf(parts);
  const items = Object.values(state.transactions);
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

/** O Intl separa "R$" e o valor com espaço não separável. */
const text = (id: string) => screen.getByTestId(id).textContent?.replace(/ /g, " ");

const salary = tx("salario", "income", 600_000, "2026-09-05");
const goal = reserve("viagem");

describe("HomePage com reservas", () => {
  it("desconta o separado do saldo total e mostra a linha do mes", () => {
    renderHome({
      transactions: [salary],
      reserves: [goal],
      movements: [movement("m1", "viagem", 110_000, "2026-09-10")],
    });
    expect(screen.getByTestId("total-balance").textContent).toContain("4.900");
    expect(text("month-saved")).toContain("Separado: R$ 1.100");
  });

  it("mostra o que voltou quando o liquido do mes e retirada", () => {
    renderHome({
      transactions: [salary],
      reserves: [goal],
      movements: [
        movement("m1", "viagem", 100_000, "2026-08-10"),
        movement("m2", "viagem", -38_000, "2026-09-12"),
      ],
    });
    expect(text("month-saved")).toContain("Voltou das reservas: R$ 380");
  });

  it("separado com centavos mostra os centavos", () => {
    renderHome({
      transactions: [salary],
      reserves: [goal],
      movements: [movement("m1", "viagem", 33_333, "2026-09-10")],
    });
    expect(text("month-saved")).toContain("Separado: R$ 333,33");
  });

  it("nao mostra a linha quando nada foi separado no mes", () => {
    renderHome({ transactions: [salary] });
    expect(screen.queryByTestId("month-saved")).toBeNull();
  });

  it("mostra o card do mes mesmo sem transacoes se houve movimento de reserva", () => {
    renderHome({
      reserves: [goal],
      movements: [movement("m1", "viagem", 50_000, "2026-09-10")],
    });
    expect(text("month-saved")).toContain("Separado: R$ 500");
  });
});
