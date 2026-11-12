import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stableEntityId } from "../../domain/ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../../domain/model/app-state";
import type { Asset } from "../../domain/model/asset";
import type { Budget } from "../../domain/model/budget";
import type { Category } from "../../domain/model/category";
import type { Debt } from "../../domain/model/debt";
import type { PaymentMethod } from "../../domain/model/payment-method";
import type { Recurrence } from "../../domain/model/recurrence";
import { ALIVE } from "../../domain/model/row.fake";
import type { Transaction } from "../../domain/model/transaction";
import { occurrenceKey } from "../../domain/recurrence/schedule";
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

function category(id: string, name: string): Category {
  return { id, name, icon: "house", color: "amber", kind: "expense", ...ALIVE };
}

function budget(categoryId: string, limitMinor: number): Budget {
  return { ...ALIVE, id: `B-${categoryId}`, categoryId, limitMinor };
}

function recurrence(overrides: Partial<Recurrence> & { id: string }): Recurrence {
  return {
    ...ALIVE,
    kind: "expense",
    description: "Aluguel",
    amountMinor: 23_000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    frequency: "monthly",
    scheduleType: "dayOfMonth",
    scheduleN: 10,
    startOn: "2026-06-10",
    endOn: null,
    active: true,
    ...overrides,
  };
}

/** O sheet aberto com este título. Fechado, o `<dialog>` continua no DOM, então checa `open`. */
function openSheet(name: string): HTMLDialogElement | null {
  const dialogs = Array.from(document.querySelectorAll("dialog"));
  return dialogs.find((item) => item.open && item.getAttribute("aria-label") === name) ?? null;
}

function tap(name: string | RegExp): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("DashboardPage", () => {
  it("chama a tela de Resumo, no título e na região", () => {
    render(<DashboardPage items={[record({ id: "a" })]} state={stateWith()} today={TODAY} />);

    expect(screen.getByRole("heading", { level: 1, name: "Resumo" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Resumo" })).toBeDefined();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("organiza a tela em três blocos, e o terceiro só existe com algo a caminho", () => {
    render(<DashboardPage items={[record({ id: "a" })]} state={stateWith()} today={TODAY} />);

    expect(screen.getByRole("heading", { level: 2, name: "Como estou" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "Para onde foi" })).toBeDefined();
    // Sem recorrência não há o que vir: um bloco só com título seria ruído.
    expect(screen.queryByRole("heading", { level: 2, name: "O que vem" })).toBeNull();
  });

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
    // ...mas junho continua na série de seis meses, que agora mora num sheet.
    expect(screen.queryByTestId("bar-expense-2026-06")).toBeNull();
    tap("Últimos 6 meses");
    expect(openSheet("Últimos 6 meses")).not.toBeNull();
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

    tap("Últimos 6 meses");

    expect(screen.getByText("Sem movimento nos últimos seis meses")).toBeDefined();
  });

  it("os últimos seis meses trazem a sobra média e fecham pelo botão", () => {
    render(
      <DashboardPage
        items={[
          record({ id: "a", kind: "income", amountMinor: 60_000, occurredOn: "2026-08-02" }),
          record({ id: "b", amountMinor: 30_000, occurredOn: "2026-07-05" }),
        ]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    tap("Últimos 6 meses");
    const sheet = within(openSheet("Últimos 6 meses") as HTMLElement);
    // (600 − 300) / 6 meses da janela = 50; frase curta, sem ponto final.
    expect(sheet.getByText(/Sobrou em média R\$\s50 por mês desde março$/u)).toBeDefined();

    fireEvent.click(sheet.getByRole("button", { name: "Fechar" }));
    expect(openSheet("Últimos 6 meses")).toBeNull();
    expect(screen.queryByTestId("bar-income-2026-08")).toBeNull();
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
    expect(screen.getByText(/0 lançamentos no mês/)).toBeDefined();
    // Sem despesa no mês não há calendário para abrir; a série continua alcançável.
    expect(screen.queryByRole("button", { name: "Saídas por dia" })).toBeNull();
    tap("Últimos 6 meses");
    expect(screen.getByText("Sem movimento nos últimos seis meses")).toBeDefined();
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

    // Frase curta não leva ponto final.
    expect(screen.getByTestId("pace-sentence").textContent).toMatch(
      /^R\$\s92,00 até o dia 10 — 8% abaixo do mesmo ponto de julho$/u,
    );
    expect(screen.getByText(/8% abaixo/)).toBeDefined();
  });

  it("sem despesa no mês o ritmo não aparece", () => {
    render(
      <DashboardPage
        items={[record({ id: "a", kind: "income", amountMinor: 5000 })]}
        state={stateWith()}
        today={TODAY}
      />,
    );

    expect(screen.queryByTestId("pace-sentence")).toBeNull();
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
    // Duas linhas cabem inteiras: não há o que "ver todas".
    expect(screen.queryByRole("button", { name: /Ver todas/ })).toBeNull();
  });

  describe("para onde foi", () => {
    // Sete categorias, de 70 a 10 reais; G é a menor e fica fora das cinco.
    const names = ["A", "B", "C", "D", "E", "F", "G"];
    const cats = names.map((id) => category(id, `Cat ${id}`));
    const spend = names.map((id, index) =>
      record({ id: `t-${id}`, categoryId: id, amountMinor: (7 - index) * 1000 }),
    );
    const withBudgets = (...budgets: Budget[]): AppState => ({
      ...stateWith(cats),
      budgets: Object.fromEntries(budgets.map((row) => [row.id, row])),
    });
    const rows = () =>
      within(screen.getByRole("region", { name: "Para onde foi" }))
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-testid"));

    it("mostra as cinco maiores e abre a lista inteira em um toque", () => {
      render(<DashboardPage items={spend} state={stateWith(cats)} today={TODAY} />);

      expect(screen.getByText("7 categorias")).toBeDefined();
      expect(rows()).toEqual(["A", "B", "C", "D", "E"].map((id) => `category-row-${id}`));

      tap("Ver todas as 7");
      const sheet = within(openSheet("Todas as categorias") as HTMLElement);
      expect(sheet.getAllByRole("listitem")).toHaveLength(7);
      expect(sheet.getByText("Cat G")).toBeDefined();
    });

    it("categoria fora das cinco entra quando a meta está em atenção ou estourada", () => {
      // G gastou 10 de um limite de 11 (90%): atenção. F tem meta folgada e fica de fora.
      render(
        <DashboardPage
          items={spend}
          state={withBudgets(budget("G", 1100), budget("F", 100_000))}
          today={TODAY}
        />,
      );

      expect(rows()).toEqual(["A", "B", "C", "D", "E", "G"].map((id) => `category-row-${id}`));
      expect(screen.getByRole("button", { name: "Ver todas as 7" })).toBeDefined();
    });

    it("a meta vira traço de limite e legenda na linha da categoria", () => {
      // B: 60 de 50 (estourou). C: 50 de 60 (83%, atenção). D: 40 de 400 (10%).
      render(
        <DashboardPage
          items={spend}
          state={withBudgets(budget("B", 5000), budget("C", 6000), budget("D", 40_000))}
          today={TODAY}
        />,
      );
      const over = within(screen.getByTestId("category-row-B"));
      const warning = within(screen.getByTestId("category-row-C"));
      const plain = within(screen.getByTestId("category-row-A"));

      expect(over.getByText("120% da meta").className).toContain("text-expense-fg");
      expect(over.getByTestId("category-fill").className).toContain("bg-expense");
      expect(warning.getByText("83% da meta").className).not.toContain("text-expense-fg");
      expect(warning.getByTestId("category-fill").className).toContain("bg-tag-amber");
      // Sem meta: barra neutra, sem traço, e a legenda é a fatia do total.
      expect(plain.getByTestId("category-fill").className).toContain("bg-neutral-500");
      expect(plain.queryByTestId("category-limit")).toBeNull();
      expect(plain.queryByRole("progressbar")).toBeNull();
      expect(plain.getByText("25%")).toBeDefined();
    });

    const block = () => screen.getByRole("region", { name: "Para onde foi" });
    const widthOf = (id: string, scope: HTMLElement = block()) =>
      within(within(scope).getByTestId(`category-row-${id}`)).getByTestId("category-fill").style
        .width;
    const limitOf = (id: string) =>
      within(within(block()).getByTestId(`category-row-${id}`)).getByTestId("category-limit").style
        .left;
    const SALARY = "01J9F3K2M7QX8YB4TVWZ0DCEH1";
    /** Estado com uma entrada recorrente mensal no dia 10, desde junho de 2026. */
    const withSalary = (amountMinor: number, ...budgets: Budget[]): AppState => {
      const salary = recurrence({
        id: SALARY,
        kind: "income",
        description: "Salário",
        amountMinor,
      });
      return { ...withBudgets(...budgets), recurrences: { [salary.id]: salary } };
    };

    it("a escala das barras é a entrada recorrente do mês", () => {
      // Salário de 1.000: A (70) ocupa 7% da renda; o limite de B (50) fica em 5%
      // e o de D (400) em 40%, mesmo sendo o maior número entre as linhas.
      render(
        <DashboardPage
          items={spend}
          state={withSalary(100_000, budget("D", 40_000), budget("B", 5000))}
          today={TODAY}
        />,
      );

      expect(widthOf("A")).toBe("7%");
      expect(widthOf("D")).toBe("4%");
      expect(limitOf("D")).toBe("40%");
      expect(limitOf("B")).toBe("5%");
    });

    it("categoria miúda perto da renda mantém o piso de 2% da barra", () => {
      // E gastou 30 de uma renda de 10.000: 0,3% sumiria do trilho.
      render(<DashboardPage items={spend} state={withSalary(1_000_000)} today={TODAY} />);

      expect(widthOf("E")).toBe("2%");
    });

    it("o sheet de todas as categorias usa a mesma escala do bloco", () => {
      render(<DashboardPage items={spend} state={withSalary(100_000)} today={TODAY} />);

      tap("Ver todas as 7");
      const sheet = openSheet("Todas as categorias") as HTMLElement;
      // Com a escala antiga, A viraria 100% nos dois; com a renda, 7% nos dois.
      expect(widthOf("A", sheet)).toBe("7%");
      expect(widthOf("G", sheet)).toBe("2%");
      expect(widthOf("A")).toBe("7%");
    });

    it("a escala é a entrada recorrente do mês selecionado, não a de hoje", () => {
      // Julho já materializado com outro valor (2.000): a barra de julho mede contra ele.
      // Id e chave determinísticos, como a materialização grava: é por eles que a
      // projeção sabe que julho já tem linha e não soma a regra por cima.
      const key = occurrenceKey(SALARY, "2026-07");
      const july = record({
        id: stableEntityId(key),
        kind: "income",
        amountMinor: 200_000,
        occurredOn: "2026-07-10",
        recurrenceId: SALARY,
        occurrenceKey: key,
      });
      const julySpend = record({
        id: "t-jul",
        categoryId: "A",
        amountMinor: 10_000,
        occurredOn: "2026-07-15",
      });
      render(
        <DashboardPage
          items={[...spend, july, julySpend]}
          state={{ ...withSalary(100_000), transactions: { [july.id]: july } }}
          today={TODAY}
        />,
      );

      tap("Mês anterior");
      expect(widthOf("A")).toBe("5%");
    });

    it("gasto ou limite acima da entrada recorrente trava em 100%, sem vazar do trilho", () => {
      // Renda fixa de 50: A (70) e o limite de D (400) passam dela.
      render(
        <DashboardPage
          items={spend}
          state={withSalary(5000, budget("D", 40_000), budget("B", 5000))}
          today={TODAY}
        />,
      );

      expect(widthOf("A")).toBe("100%");
      expect(limitOf("D")).toBe("100%");
      expect(limitOf("B")).toBe("100%");
      expect(widthOf("E")).toBe("60%");
    });

    it("sem entrada recorrente no mês, a escala é o maior gasto ou o maior limite mostrado", () => {
      // O limite de D (400) é o maior número entre as linhas: ele vira os 100%.
      render(
        <DashboardPage
          items={spend}
          state={withBudgets(budget("D", 40_000), budget("B", 5000))}
          today={TODAY}
        />,
      );

      expect(widthOf("A")).toBe("17.5%");
      expect(widthOf("D")).toBe("10%");
      expect(limitOf("D")).toBe("100%");
      expect(limitOf("B")).toBe("12.5%");
    });

    it("saída recorrente sozinha não vira escala", () => {
      const rent = recurrence({ id: "01J9F3K2M7QX8YB4TVWZ0DCEH2" });
      render(
        <DashboardPage
          items={spend}
          state={{ ...stateWith(cats), recurrences: { [rent.id]: rent } }}
          today={TODAY}
        />,
      );

      expect(widthOf("A")).toBe("100%");
    });

    it("a barra de meta fala só em porcentagem, como a BudgetBar", () => {
      render(
        <DashboardPage
          items={spend}
          state={withBudgets(budget("B", 5000), budget("C", 6000))}
          today={TODAY}
        />,
      );

      const over = screen.getByRole("progressbar", { name: "Meta de Cat B" });
      expect(over.getAttribute("aria-valuetext")).toBe("Meta estourada: 120% usado");
      expect(over.getAttribute("aria-valuenow")).toBe("100");
      expect(
        screen.getByRole("progressbar", { name: "Meta de Cat C" }).getAttribute("aria-valuetext"),
      ).toBe("83% da meta usada");
    });

    it("leva ao orçamento quando há meta e para onde ir", () => {
      const onOpen = vi.fn();
      const view = render(
        <DashboardPage
          items={spend}
          state={withBudgets(budget("B", 5000))}
          today={TODAY}
          onOpenBudgets={onOpen}
        />,
      );

      tap("Ver orçamento");
      expect(onOpen).toHaveBeenCalledTimes(1);

      view.rerender(
        <DashboardPage
          items={spend}
          state={stateWith(cats)}
          today={TODAY}
          onOpenBudgets={onOpen}
        />,
      );
      expect(screen.queryByRole("button", { name: "Ver orçamento" })).toBeNull();
    });
  });

  describe("cashback", () => {
    const card: PaymentMethod = {
      ...ALIVE,
      id: "pm",
      name: "Cartão",
      icon: "credit-card",
      color: "sky",
      kind: "credit",
    };
    const state: AppState = { ...stateWith(), paymentMethods: { pm: card } };

    it("some quando o total do mês é zero, mesmo com compra no cartão", () => {
      render(
        <DashboardPage
          items={[record({ id: "a", paymentMethodId: "pm" })]}
          state={state}
          today={TODAY}
        />,
      );

      expect(screen.queryByTestId("cashback-line")).toBeNull();
      expect(screen.queryByText(/cashback/)).toBeNull();
    });

    it("com cashback, é uma linha de texto no fim do card do saldo", () => {
      render(
        <DashboardPage
          items={[
            record({ id: "a", paymentMethodId: "pm", cashbackMinor: 1230 }),
            record({ id: "b", paymentMethodId: "pm" }),
          ]}
          state={state}
          today={TODAY}
        />,
      );

      const line = within(screen.getByRole("region", { name: "Saldo do mês" })).getByTestId(
        "cashback-line",
      );
      expect(line.textContent).toMatch(/^R\$\s12,30 de cashback · 2 compras no crédito e débito$/u);
    });
  });

  describe("mapa de calor", () => {
    const month = [
      record({ id: "a", occurredOn: "2026-08-03", amountMinor: 10_000 }),
      record({ id: "b", occurredOn: "2026-08-03", amountMinor: 20_000, description: "Feira" }),
      record({ id: "c", occurredOn: "2026-08-05", amountMinor: 5_000 }),
      record({ id: "t", occurredOn: "2026-08-06", amountMinor: 99_000, reportState: "transfer" }),
    ];

    it("mora num sheet: a página não carrega o calendário até pedirem", () => {
      render(<DashboardPage items={month} state={stateWith()} today={TODAY} />);

      expect(screen.queryByTestId("heat-day-3")).toBeNull();
      tap("Saídas por dia");
      expect(openSheet("Saídas por dia")).not.toBeNull();
      expect(screen.getByTestId("heat-day-3")).toBeDefined();
    });

    it("mostra a intensidade e os tres numeros de apoio", () => {
      render(<DashboardPage items={month} state={stateWith()} today={TODAY} />);
      tap("Saídas por dia");

      expect(screen.getByTestId("heat-day-3").getAttribute("data-level")).toBe("4");
      expect(screen.getByTestId("heat-day-5").getAttribute("data-level")).toBe("1");
      // A transferência não conta: o dia 6 fica sem saída.
      expect(screen.getByTestId("heat-day-6").getAttribute("data-level")).toBe("0");
      // Até o dia 10: 350 / 10 = 35 por dia; saídas em 2 dias, 8 sem saída.
      expect(screen.getByTestId("heat-average").textContent).toContain("35");
      expect(screen.getByTestId("heat-peak").textContent).toContain("300");
      expect(screen.getByTestId("heat-empty").textContent).toBe("8");
    });

    it("tocar no dia fecha o calendario e lista os lancamentos dele", () => {
      render(<DashboardPage items={month} state={stateWith()} today={TODAY} />);
      tap("Saídas por dia");

      fireEvent.click(screen.getByTestId("heat-day-3"));

      // Um sheet por vez: dois <dialog> modais empilhados deixariam o calendário por baixo.
      expect(openSheet("Saídas por dia")).toBeNull();
      expect(screen.getByRole("button", { name: "Editar Feira" })).toBeDefined();
      expect(screen.getByText(/2 saídas/)).toBeDefined();
    });

    it("fechar o dia volta ao calendario", () => {
      render(<DashboardPage items={month} state={stateWith()} today={TODAY} />);
      tap("Saídas por dia");
      fireEvent.click(screen.getByTestId("heat-day-3"));

      const day = Array.from(document.querySelectorAll("dialog")).find(
        (item) => item.open,
      ) as HTMLElement;
      fireEvent.click(within(day).getByRole("button", { name: "Fechar" }));

      expect(screen.queryByRole("button", { name: "Editar Feira" })).toBeNull();
      expect(openSheet("Saídas por dia")).not.toBeNull();
      expect(screen.getByTestId("heat-day-3")).toBeDefined();
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
      tap("Saídas por dia");

      fireEvent.click(screen.getByTestId("heat-day-3"));
      fireEvent.click(screen.getByRole("button", { name: "Editar Feira" }));

      expect(edited).toEqual(["b"]);
      // Quem foi editar não volta para o calendário por baixo do formulário.
      expect(document.querySelectorAll("dialog[open]")).toHaveLength(0);
    });
  });

  describe("dinheiro livre mês que vem", () => {
    const series = [
      recurrence({
        id: "01J9F3K2M7QX8YB4TVWZ0DCEH1",
        kind: "income",
        description: "Salário",
        amountMinor: 100_000,
      }),
      recurrence({ id: "01J9F3K2M7QX8YB4TVWZ0DCEH2" }),
    ];
    const state: AppState = {
      ...stateWith(),
      recurrences: Object.fromEntries(series.map((row) => [row.id, row])),
    };

    it("mostra o que sobra das entradas recorrentes depois das saídas", () => {
      render(<DashboardPage items={[record({ id: "a" })]} state={state} today={TODAY} />);

      expect(screen.getByRole("heading", { level: 2, name: "O que vem" })).toBeDefined();
      const card = screen.getByRole("region", { name: "Dinheiro livre mês que vem" });
      expect(within(card).getByText("Livre em setembro")).toBeDefined();
      expect(screen.getByTestId("free-money").textContent).toContain("770");
      expect(screen.getByTestId("free-money-of").textContent).toMatch(/de R\$\s1\.000,00/u);
      expect(screen.getByTestId("free-money-expense").textContent).toMatch(
        /^R\$\s230,00 já comprometido$/u,
      );
    });

    it("a barra do comprometido é neutra e fala só em porcentagem", () => {
      render(<DashboardPage items={[record({ id: "a" })]} state={state} today={TODAY} />);

      const bar = within(
        screen.getByRole("region", { name: "Dinheiro livre mês que vem" }),
      ).getByRole("img");
      expect(bar.getAttribute("aria-label")).toBe("23% das entradas recorrentes já comprometidos");
      expect(bar.outerHTML).not.toMatch(/bg-(income|expense)/);
    });

    it("avisa da estimativa, sem ponto final, quando há série de valor variável", () => {
      const variable: AppState = {
        ...state,
        recurrences: {
          ...state.recurrences,
          "01J9F3K2M7QX8YB4TVWZ0DCEH3": recurrence({
            id: "01J9F3K2M7QX8YB4TVWZ0DCEH3",
            description: "Luz",
            amountMinor: 12_000,
            variable: true,
          }),
        },
      };
      render(<DashboardPage items={[record({ id: "a" })]} state={variable} today={TODAY} />);

      expect(screen.getByText("Inclui a estimativa de contas com valor variável")).toBeDefined();
    });

    it("não existe fora do mês corrente", () => {
      render(
        <DashboardPage
          items={[record({ id: "a" }), record({ id: "b", occurredOn: "2026-07-05" })]}
          state={state}
          today={TODAY}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));

      expect(screen.queryByRole("heading", { level: 2, name: "O que vem" })).toBeNull();
    });

    it("some sem nenhuma recorrência", () => {
      render(<DashboardPage items={[record({ id: "a" })]} state={stateWith()} today={TODAY} />);

      expect(screen.queryByRole("region", { name: "Dinheiro livre mês que vem" })).toBeNull();
    });

    describe("próximas recorrentes", () => {
      // Cinco séries mensais nos dias 11 a 15; hoje é dia 10.
      const many = [
        recurrence({
          id: "01J9F3K2M7QX8YB4TVWZ0DCEH1",
          kind: "income",
          description: "Salário",
          amountMinor: 100_000,
          scheduleN: 11,
        }),
        recurrence({ id: "01J9F3K2M7QX8YB4TVWZ0DCEH2", scheduleN: 12 }),
        recurrence({
          id: "01J9F3K2M7QX8YB4TVWZ0DCEH3",
          description: "Luz",
          amountMinor: 17_991,
          scheduleN: 13,
          variable: true,
        }),
        recurrence({ id: "01J9F3K2M7QX8YB4TVWZ0DCEH4", description: "Internet", scheduleN: 14 }),
        recurrence({ id: "01J9F3K2M7QX8YB4TVWZ0DCEH5", description: "Academia", scheduleN: 15 }),
      ];
      const busy: AppState = {
        ...stateWith(),
        recurrences: Object.fromEntries(many.map((row) => [row.id, row])),
      };

      it("mostra as três primeiras e abre todas em um toque", () => {
        render(<DashboardPage items={[record({ id: "a" })]} state={busy} today={TODAY} />);

        const card = within(screen.getByRole("region", { name: "Próximas recorrentes" }));
        expect(card.getAllByRole("listitem")).toHaveLength(3);
        expect(card.queryByText("Internet")).toBeNull();

        fireEvent.click(card.getByRole("button", { name: "Ver todas as 5" }));
        const sheet = within(openSheet("Recorrentes a caminho") as HTMLElement);
        expect(sheet.getAllByRole("listitem")).toHaveLength(5);
        expect(sheet.getByText("Academia")).toBeDefined();
      });

      it("com três ou menos não oferece ver todas", () => {
        const few: AppState = {
          ...stateWith(),
          recurrences: Object.fromEntries(many.slice(0, 3).map((row) => [row.id, row])),
        };
        render(<DashboardPage items={[record({ id: "a" })]} state={few} today={TODAY} />);

        const card = within(screen.getByRole("region", { name: "Próximas recorrentes" }));
        expect(card.getAllByRole("listitem")).toHaveLength(3);
        expect(card.queryByRole("button", { name: /Ver todas/ })).toBeNull();
      });

      it("despesa vai sem sinal, receita com + e verde, estimada com til", () => {
        // `~−R$` era lido como "~~R$": a despesa perde o sinal, o til fica só na estimativa.
        render(<DashboardPage items={[record({ id: "a" })]} state={busy} today={TODAY} />);

        const amounts = screen
          .getAllByTestId("upcoming-amount")
          .map((item) => ({ text: item.textContent, income: item.className.includes("income") }));
        expect(amounts[0]?.text).toMatch(/^\+R\$\s1\.000,00$/u);
        expect(amounts[0]?.income).toBe(true);
        expect(amounts[1]?.text).toMatch(/^R\$\s230,00$/u);
        expect(amounts[1]?.income).toBe(false);
        expect(amounts[2]?.text).toMatch(/^aproximadamente ~R\$\s179,91$/u);
        expect(
          screen.getByRole("region", { name: "Próximas recorrentes" }).textContent,
        ).not.toContain("−");
      });
    });
  });
});

describe("DashboardPage: bloco Negócio", () => {
  const asset = (id: string, kind: Asset["kind"], valueMinor: number): Asset => ({
    ...ALIVE,
    id,
    kind,
    name: id,
    valueMinor,
    acquiredOn: "2026-07-01",
    book: "business",
  });
  const debt = (id: string, balanceMinor: number): Debt => ({
    ...ALIVE,
    id,
    name: id,
    principalMinor: 9_999_999,
    balanceMinor,
    book: "business",
  });
  const withPatrimony: AppState = {
    ...stateWith(),
    assets: Object.fromEntries(
      [
        asset("a1", "investment", 1_000_000),
        asset("a2", "inventory", 300_000),
        asset("a3", "equipment", 450_000),
        {
          ...asset("a4", "equipment", 7_777_777),
          deletedAt: "1754568000001-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ",
        },
      ].map((a) => [a.id, a]),
    ),
    debts: Object.fromEntries([debt("d1", 700_000), debt("d2", 20_000)].map((d) => [d.id, d])),
  };
  const sales = record({ id: "s", kind: "income", description: "Venda", amountMinor: 200_000 });
  const supply = record({ id: "f", amountMinor: 80_000 });

  const blockText = (testId: string) =>
    (screen.getByTestId(testId).textContent ?? "").replace(/ /g, " ");

  it("na conta comercial mostra o bloco com resultado, capital por tipo, total aplicado e dívidas", () => {
    render(<DashboardPage items={[sales, supply]} state={withPatrimony} today={TODAY} business />);

    expect(screen.getByRole("heading", { level: 2, name: "Negócio" })).toBeDefined();
    expect(blockText("business-income")).toBe("R$ 2.000,00");
    expect(blockText("business-expense")).toBe("R$ 800,00");
    expect(blockText("business-investment")).toBe("R$ 10.000,00");
    expect(blockText("business-inventory")).toBe("R$ 3.000,00");
    expect(blockText("business-equipment")).toBe("R$ 4.500,00");
    expect(blockText("business-capital")).toBe("R$ 17.500,00");
    expect(blockText("business-debt")).toBe("R$ 7.200,00");
    expect(screen.getByText("Capital total aplicado")).toBeDefined();
    expect(screen.getByText("Dívidas totais")).toBeDefined();
  });

  it("o resultado é o mesmo número do card do saldo e bens e dívidas não o mexem", () => {
    render(<DashboardPage items={[sales, supply]} state={withPatrimony} today={TODAY} business />);
    expect(blockText("business-result")).toBe(blockText("dashboard-balance"));
    expect(blockText("business-result")).toContain("R$ 1.200,00");
    expect(blockText("total-income")).toBe("R$ 2.000,00");
    expect(blockText("total-expense")).toBe("R$ 800,00");
  });

  it('fica acima de "Como estou"', () => {
    render(<DashboardPage items={[sales]} state={withPatrimony} today={TODAY} business />);
    const negocio = screen.getByRole("heading", { level: 2, name: "Negócio" });
    const como = screen.getByRole("heading", { level: 2, name: "Como estou" });
    expect(negocio.compareDocumentPosition(como) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sem lançamento nenhum, o patrimônio continua aparecendo acima do vazio", () => {
    render(<DashboardPage items={[]} state={withPatrimony} today={TODAY} business />);
    expect(blockText("business-capital")).toBe("R$ 17.500,00");
    expect(blockText("business-debt")).toBe("R$ 7.200,00");
    expect(blockText("business-result")).toContain("R$ 0,00");
    expect(screen.getByRole("heading", { name: "O resumo de agosto aparece aqui" })).toBeDefined();
  });

  it("conta comercial recém-criada, sem bem nem dívida, mostra o bloco zerado", () => {
    render(<DashboardPage items={[sales]} state={stateWith()} today={TODAY} business />);
    expect(blockText("business-capital")).toBe("R$ 0,00");
    expect(blockText("business-debt")).toBe("R$ 0,00");
  });

  it("na conta pessoal o Resumo não tem o bloco, mesmo com bens no estado", () => {
    render(<DashboardPage items={[sales, supply]} state={withPatrimony} today={TODAY} />);
    expect(screen.queryByRole("heading", { level: 2, name: "Negócio" })).toBeNull();
    expect(screen.queryByTestId("business-capital")).toBeNull();
    expect(screen.queryByText("Dívidas totais")).toBeNull();
  });
});
