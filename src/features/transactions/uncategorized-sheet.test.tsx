import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALIVE } from "../../domain/model/row.fake";
import { stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { HomePage } from "../home/home-page";
import { UncategorizedSheet } from "./uncategorized-sheet";

afterEach(cleanup);

const FOOD = "cat-alimentacao";
const SALARY = "cat-salario";

function category(id: string, name: string, kind: "expense" | "income") {
  return { ...ALIVE, id, name, icon: "tag", color: "sky" as const, kind };
}

const state = {
  ...stateOf({
    transactions: [
      tx("hist", "expense", 900, "2026-08-01", FOOD, { description: "Padaria" }),
      tx("a", "expense", 1_000, "2026-09-05", null, { description: "Padaria do Zé" }),
      tx("b", "expense", 2_000, "2026-09-06", null, { description: "Cinema" }),
      tx("c", "income", 9_000, "2026-09-07", null, { description: "Freela" }),
      tx("t", "expense", 4_000, "2026-09-08", null, {
        description: "Fatura",
        reportState: "transfer",
      }),
    ],
  }),
  categories: {
    [FOOD]: category(FOOD, "Alimentação", "expense"),
    [SALARY]: category(SALARY, "Salário", "income"),
  },
};

function open(onApply = vi.fn().mockResolvedValue(1)) {
  render(<UncategorizedSheet state={state} onApply={onApply} onClose={vi.fn()} />);
  return onApply;
}

const check = (name: string) => fireEvent.click(screen.getByRole("checkbox", { name }));
const select = () => screen.getByLabelText("Categoria para os marcados") as HTMLSelectElement;

describe("UncategorizedSheet", () => {
  it("lista só o que está sem categoria e conta: sem o transferido nem os classificados", () => {
    open();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.queryByRole("checkbox", { name: "Selecionar Fatura" })).toBeNull();
  });

  it("sem marcar nada o botão fica desabilitado", () => {
    open();
    expect(screen.getByRole("button", { name: /Aplicar categoria/ }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("pré-seleciona a sugestão do histórico, mas não aplica sozinha", () => {
    const onApply = open();
    check("Selecionar Padaria do Zé");

    expect(select().value).toBe(FOOD);
    expect(screen.getByText(/Sugerida pelo seu histórico/)).toBeDefined();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("sugestões que divergem não pré-selecionam nada", () => {
    open();
    check("Selecionar Padaria do Zé");
    check("Selecionar Cinema");

    expect(select().value).toBe("");
  });

  it("receita e despesa juntas só oferecem categoria que serve aos dois lados", () => {
    open();
    check("Selecionar Cinema");
    check("Selecionar Freela");

    expect([...select().options].map((option) => option.textContent)).toEqual([
      "Escolha a categoria",
    ]);
  });

  it("aplica nos marcados com a categoria confirmada", async () => {
    const onApply = open();
    check("Selecionar Padaria do Zé");
    check("Selecionar Cinema");
    fireEvent.change(select(), { target: { value: FOOD } });

    fireEvent.click(screen.getByRole("button", { name: "Aplicar categoria (2)" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(["b", "a"], FOOD));
  });

  it("falha avisa que nada foi alterado e mantém a seleção", async () => {
    const onApply = open(vi.fn().mockRejectedValue(new Error("Lançamento mudou em outra aba.")));
    check("Selecionar Cinema");
    fireEvent.change(select(), { target: { value: FOOD } });

    fireEvent.click(screen.getByRole("button", { name: /Aplicar categoria/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nada foi alterado");
    expect(alert.textContent).toContain("outra aba");
    expect(
      (screen.getByRole("checkbox", { name: "Selecionar Cinema" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("marcar todos e desmarcar todos", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Marcar todos" }));
    expect(screen.getByRole("button", { name: "Aplicar categoria (3)" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todos" }));
    expect(screen.getByRole("button", { name: /Aplicar categoria/ }).textContent).toBe(
      "Aplicar categoria",
    );
  });

  it("tudo classificado mostra o estado final", () => {
    const limpo = {
      ...state,
      transactions: {
        hist: state.transactions.hist as NonNullable<typeof state.transactions.hist>,
      },
    };
    render(<UncategorizedSheet state={limpo} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Tudo classificado" })).toBeDefined();
  });
});

describe("contador na Início", () => {
  function home(onClassify?: () => void, current = state) {
    render(
      <HomePage
        items={Object.values(current.transactions)}
        state={current}
        profile={null}
        today="2026-09-20"
        hour={10}
        onCompose={vi.fn()}
        onImport={vi.fn()}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onOpenProfile={vi.fn()}
        onClassify={onClassify}
      />,
    );
  }

  it("mostra quantos faltam e abre a fila", () => {
    const onClassify = vi.fn();
    home(onClassify);

    const counter = screen.getByTestId("uncategorized-counter");
    expect(counter.textContent).toContain("3");
    expect(counter.textContent).toContain("sem categoria");
    fireEvent.click(counter);
    expect(onClassify).toHaveBeenCalledTimes(1);
  });

  it("some quando não há pendência", () => {
    home(vi.fn(), {
      ...state,
      transactions: {
        hist: state.transactions.hist as NonNullable<typeof state.transactions.hist>,
      },
    });
    expect(screen.queryByTestId("uncategorized-counter")).toBeNull();
  });

  it("sem o callback o contador não aparece", () => {
    home(undefined);
    expect(screen.queryByTestId("uncategorized-counter")).toBeNull();
  });
});
