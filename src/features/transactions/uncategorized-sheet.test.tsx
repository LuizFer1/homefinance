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
const next = () => fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
const tile = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const disabled = (name: RegExp | string) =>
  (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

describe("UncategorizedSheet", () => {
  it("lista só o que está sem categoria e conta: sem o transferido nem os classificados", () => {
    open();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.queryByRole("checkbox", { name: "Selecionar Fatura" })).toBeNull();
  });

  it("sem marcar nada não dá para continuar", () => {
    open();
    expect(disabled(/Continuar/)).toBe(true);
  });

  it("pré-seleciona a sugestão do histórico, mas não aplica sozinha", () => {
    const onApply = open();
    check("Selecionar Padaria do Zé");
    next();

    expect(tile("Alimentação").checked).toBe(true);
    expect(screen.getByText(/Sugerida pelo seu histórico/)).toBeDefined();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("sugestões que divergem não pré-selecionam nada", () => {
    open();
    check("Selecionar Padaria do Zé");
    check("Selecionar Cinema");
    next();

    expect(tile("Alimentação").checked).toBe(false);
    expect(disabled(/Continuar/)).toBe(true);
  });

  it("receita e despesa juntas só oferecem categoria que serve aos dois lados", () => {
    open();
    check("Selecionar Cinema");
    check("Selecionar Freela");
    next();

    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText(/Nenhuma categoria serve/)).toBeDefined();
  });

  it("a prévia mostra o que vai mudar e aplica com a categoria confirmada", async () => {
    const onApply = open();
    check("Selecionar Padaria do Zé");
    check("Selecionar Cinema");
    next();
    fireEvent.click(tile("Alimentação"));
    next();

    const preview = screen.getByRole("list", { name: "Prévia" });
    expect(preview.textContent).toContain("Cinema");
    expect(preview.textContent).toContain("Sem categoria → Alimentação");
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar categoria (2)" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(["b", "a"], FOOD));
  });

  it("falha avisa que nada foi alterado e mantém a seleção", async () => {
    const onApply = open(vi.fn().mockRejectedValue(new Error("Lançamento mudou em outra aba.")));
    check("Selecionar Cinema");
    next();
    fireEvent.click(tile("Alimentação"));
    next();

    fireEvent.click(screen.getByRole("button", { name: /Aplicar categoria/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nada foi alterado");
    expect(alert.textContent).toContain("outra aba");
    expect(screen.getByRole("list", { name: "Prévia" }).textContent).toContain("Cinema");
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("marcar todos e desmarcar todos", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Marcar todos" }));
    expect(disabled(/Continuar/)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todos" }));
    expect(disabled(/Continuar/)).toBe(true);
  });

  it("voltar da prévia mantém a escolha", () => {
    open();
    check("Selecionar Cinema");
    next();
    fireEvent.click(tile("Alimentação"));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));

    expect(tile("Alimentação").checked).toBe(true);
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
