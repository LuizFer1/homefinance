import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { card } from "../../domain/cards/fixtures.fake";
import { DELETED_AT } from "../../domain/model/row.fake";
import { reserve, stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { HomePage } from "./home-page";

afterEach(cleanup);

type Methods = ReturnType<typeof card>[];

function renderHome(
  transactions: ReturnType<typeof tx>[],
  methods: Methods = [],
  onOpenInvoices?: () => void,
) {
  const base = stateOf({ transactions, reserves: [reserve("viagem")] });
  const state = { ...base, paymentMethods: Object.fromEntries(methods.map((m) => [m.id, m])) };
  render(
    <HomePage
      items={Object.values(state.transactions)}
      state={state}
      profile={null}
      today="2026-09-20"
      hour={10}
      onCompose={vi.fn()}
      onImport={vi.fn()}
      onEdit={vi.fn()}
      onConfirm={vi.fn()}
      onOpenProfile={vi.fn()}
      onOpenInvoices={onOpenInvoices}
    />,
  );
}

const salary = tx("salario", "income", 600_000, "2026-09-05");
const nu = card("nu", { name: "Nubank", color: "violet" });
const itau = card("itau", { name: "Itaú", color: "orange" });

function onCard(id: string, amount: number, method: string) {
  return tx(id, "expense", amount, "2026-09-06", null, { paymentMethodId: method });
}

describe("Home: barra por cartão", () => {
  it("sem gasto em cartão a barra é a de sempre: dois segmentos e nenhuma legenda", () => {
    renderHome([salary, tx("m", "expense", 10_000, "2026-09-06")], [nu]);

    expect(screen.queryAllByTestId("card-segment")).toHaveLength(0);
    expect(screen.queryByTestId("card-legend")).toBeNull();
    expect(screen.getByTestId("month-bar").children).toHaveLength(2);
    expect(screen.getByTestId("month-bar").className).toContain("bg-neutral-800");
  });

  it("um segmento por cartão, na cor dele, com largura proporcional ao gasto", () => {
    renderHome(
      [
        salary,
        onCard("a", 30_000, "nu"),
        onCard("b", 10_000, "itau"),
        tx("c", "expense", 5_000, "2026-09-08"),
      ],
      [nu, itau],
    );

    const segments = screen.getAllByTestId("card-segment");
    expect(segments.map((s) => s.getAttribute("data-segment"))).toEqual(["nu", "itau"]);
    expect(segments[0]?.style.backgroundColor).toBe("var(--color-tag-violet)");
    expect(segments[1]?.style.backgroundColor).toBe("var(--color-tag-orange)");
    expect(Number(segments[0]?.style.flexGrow)).toBe(30_000);
    expect(Number(segments[1]?.style.flexGrow)).toBe(10_000);
    // Receita, despesa fora do cartão e os dois cartões.
    expect(screen.getByTestId("month-bar").children).toHaveLength(4);
  });

  it("a legenda diz o nome e o valor de cada cartão em texto", () => {
    renderHome([salary, onCard("a", 30_000, "nu"), onCard("b", 10_000, "itau")], [nu, itau]);

    const items = screen.getByTestId("card-legend").querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent?.replace(/ /g, " ")).toContain("Nubank");
    expect(items[0]?.textContent?.replace(/ /g, " ")).toContain("R$ 300");
    expect(items[1]?.textContent).toContain("Itaú");
  });

  it("aguenta cinco cartões lado a lado, com legenda que quebra linha", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) =>
      card(id, { name: `Cartão número ${id}`, color: "sky" }),
    );
    renderHome([salary, ...five.map((m, i) => onCard(`t${m.id}`, 1_000 * (i + 1), m.id))], five);

    expect(screen.getAllByTestId("card-segment")).toHaveLength(5);
    const legend = screen.getByTestId("card-legend");
    expect(legend.querySelectorAll("li")).toHaveLength(5);
    expect(legend.className).toContain("flex-wrap");
  });

  it("com mais de cinco cartões, os menores viram 'Outros cartões'", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"].map((id) => card(id, { name: id }));
    renderHome([salary, ...seven.map((m, i) => onCard(`t${m.id}`, 1_000 * (i + 1), m.id))], seven);

    expect(screen.getAllByTestId("card-segment")).toHaveLength(5);
    expect(screen.getByTestId("card-legend").textContent).toContain("Outros cartões");
  });

  it("cartão apagado vira segmento neutro, sem quebrar a Home", () => {
    const dead = card("velho", { name: "Velho", color: "rose", deletedAt: DELETED_AT });
    renderHome([salary, onCard("a", 4_000, "velho")], [dead]);

    const [segment] = screen.getAllByTestId("card-segment");
    expect(segment?.style.backgroundColor).toBe("var(--color-tag-slate)");
    expect(screen.getByTestId("card-legend").textContent).toContain("Cartão removido");
  });

  it("cor de uma versão futura degrada para o neutro", () => {
    const strange = card("estranho", { color: "chartreuse" as never });
    renderHome([salary, onCard("a", 4_000, "estranho")], [strange]);

    const [segment] = screen.getAllByTestId("card-segment");
    expect(segment?.style.backgroundColor).toBe("var(--color-tag-slate)");
  });

  it("subtrai na compra: o gasto do cartão já está na despesa e no saldo", () => {
    renderHome([salary, onCard("a", 30_000, "nu")], [nu]);

    expect(screen.getByLabelText(/Resumo de Setembro/).textContent).toContain("300,00");
    expect(screen.getByTestId("total-balance").textContent).toContain("5.700");
  });

  it("o botão Faturas leva às faturas", () => {
    const onOpenInvoices = vi.fn();
    renderHome([salary, onCard("a", 1_000, "nu")], [nu], onOpenInvoices);

    fireEvent.click(screen.getByRole("button", { name: "Faturas" }));

    expect(onOpenInvoices).toHaveBeenCalledOnce();
  });
});
