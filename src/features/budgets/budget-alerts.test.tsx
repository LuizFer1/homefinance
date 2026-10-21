import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_APP_STATE } from "../../domain/model/app-state";
import type { Budget } from "../../domain/model/budget";
import type { Category } from "../../domain/model/category";
import { ALIVE } from "../../domain/model/row.fake";
import { tx } from "../../domain/reserves/fixtures.fake";
import { DashboardPage } from "../dashboard/dashboard-page";
import { HomePage } from "../home/home-page";
import { hideValues } from "../privacy/privacy";

afterEach(() => {
  cleanup();
  hideValues.value = false;
});

const category = (id: string, name: string): Category => ({
  ...ALIVE,
  id,
  name,
  icon: "tag",
  color: "sky",
  kind: "expense",
});

const budget = (categoryId: string, limitMinor: number): Budget => ({
  ...ALIVE,
  id: `B-${categoryId}`,
  categoryId,
  limitMinor,
});

const categories = Object.fromEntries(
  [category("FOOD", "Alimentação"), category("FUN", "Lazer"), category("CAR", "Carro")].map((c) => [
    c.id,
    c,
  ]),
);

// Alimentação a 85%, Lazer estourada, Carro a 10%.
const items = [
  tx("a", "expense", 85_000, "2026-09-02", "FOOD"),
  tx("b", "expense", 35_000, "2026-09-03", "FUN"),
  tx("c", "expense", 5_000, "2026-09-04", "CAR"),
];

const withBudgets = {
  ...EMPTY_APP_STATE,
  categories,
  transactions: Object.fromEntries(items.map((t) => [t.id, t])),
  budgets: Object.fromEntries(
    [budget("FOOD", 100_000), budget("FUN", 20_000), budget("CAR", 50_000)].map((b) => [b.id, b]),
  ),
};
const withoutBudgets = { ...withBudgets, budgets: {} };

function home(state: typeof withBudgets, onOpenBudgets?: () => void) {
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
      onOpenBudgets={onOpenBudgets}
    />,
  );
}

function dashboard(state: typeof withBudgets, onOpenBudgets?: () => void) {
  render(
    <DashboardPage items={items} state={state} today="2026-09-20" onOpenBudgets={onOpenBudgets} />,
  );
}

describe("aviso de meta em risco na Início", () => {
  it("mostra as duas metas em risco, a estourada primeiro, e abre o Orçamento", () => {
    const onOpen = vi.fn();
    home(withBudgets, onOpen);

    const alert = screen.getByTestId("budget-alert");
    expect(alert.textContent).toContain("2");
    expect(alert.textContent).toContain("metas em risco");
    expect(alert.textContent).toContain("Lazer estourou");
    expect(alert.textContent).toContain("Alimentação 85%");
    expect(alert.textContent?.indexOf("Lazer")).toBeLessThan(
      alert.textContent?.indexOf("Alimentação") ?? 0,
    );

    fireEvent.click(alert);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("sem metas, nada aparece", () => {
    home(withoutBudgets, vi.fn());
    expect(screen.queryByTestId("budget-alert")).toBeNull();
  });

  it("meta longe do limite não avisa", () => {
    const calm = {
      ...withBudgets,
      budgets: { "B-CAR": budget("CAR", 50_000) },
    };
    home(calm, vi.fn());
    expect(screen.queryByTestId("budget-alert")).toBeNull();
  });

  it("sem o callback o aviso não aparece", () => {
    home(withBudgets);
    expect(screen.queryByTestId("budget-alert")).toBeNull();
  });

  it("ocultar valores: o aviso não carrega valor algum", () => {
    hideValues.value = true;
    home(withBudgets, vi.fn());
    expect(screen.getByTestId("budget-alert").textContent).not.toMatch(/R\$|\d\d\d,\d\d/);
  });
});

describe("card de metas no Dashboard", () => {
  it("lista as metas do mês com uso e leva ao Orçamento", () => {
    const onOpen = vi.fn();
    dashboard(withBudgets, onOpen);

    const card = within(screen.getByRole("region", { name: "Metas" }));
    expect(card.getByRole("progressbar", { name: "Meta de Lazer" })).toBeDefined();
    expect(card.getByRole("progressbar", { name: "Meta de Alimentação" })).toBeDefined();
    expect(card.getByText("175%")).toBeDefined();

    fireEvent.click(card.getByRole("button", { name: "Ver orçamento" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("mostra só as mais usadas", () => {
    const many = {
      ...withBudgets,
      categories: { ...categories, X: category("X", "Extra") },
      budgets: {
        ...withBudgets.budgets,
        "B-X": budget("X", 1_000_000),
      },
    };
    dashboard(many, vi.fn());
    const card = within(screen.getByRole("region", { name: "Metas" }));
    expect(card.getAllByRole("progressbar")).toHaveLength(3);
    expect(card.queryByRole("progressbar", { name: "Meta de Extra" })).toBeNull();
  });

  it("sem metas, o card não existe", () => {
    dashboard(withoutBudgets, vi.fn());
    expect(screen.queryByRole("region", { name: "Metas" })).toBeNull();
  });
});
