import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_APP_STATE } from "../../domain/model/app-state";
import type { Budget } from "../../domain/model/budget";
import type { Category } from "../../domain/model/category";
import { ALIVE } from "../../domain/model/row.fake";
import { tx } from "../../domain/reserves/fixtures.fake";
import { hideValues } from "../privacy/privacy";
import { BudgetsPage } from "./budgets-page";
import type { BudgetsStore } from "./store";

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

const state = {
  ...EMPTY_APP_STATE,
  categories: Object.fromEntries(
    [category("FOOD", "Alimentação"), category("FUN", "Lazer"), category("PET", "Pet")].map((c) => [
      c.id,
      c,
    ]),
  ),
  budgets: Object.fromEntries(
    [budget("FOOD", 100_000), budget("FUN", 20_000)].map((b) => [b.id, b]),
  ),
};

const items = [
  tx("a", "expense", 85_000, "2026-09-02", "FOOD"),
  tx("b", "expense", 35_000, "2026-09-03", "FUN"),
  tx("c", "expense", 12_000, "2026-09-04", "PET"),
  tx("d", "expense", 90_000, "2026-09-05", "FOOD", { reportState: "transfer" }),
  tx("e", "expense", 4_000, "2026-09-06", null),
];

function open(overrides: Partial<{ state: typeof state; items: typeof items }> = {}) {
  const store: BudgetsStore = {
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <BudgetsPage
      state={overrides.state ?? state}
      items={overrides.items ?? items}
      today="2026-09-20"
      store={store}
      onBack={vi.fn()}
    />,
  );
  return store;
}

describe("BudgetsPage", () => {
  it("mostra gasto, meta, restante e uso de cada categoria", () => {
    open();
    const metas = within(screen.getByRole("list", { name: "Metas" }));

    const food = metas.getByRole("progressbar", { name: "Meta de Alimentação" });
    expect(food.getAttribute("aria-valuenow")).toBe("85");
    expect(food.getAttribute("aria-valuetext")).toBe("85% da meta usada");
    const row = food.closest("li");
    expect(row?.textContent).toContain("850,00");
    expect(row?.textContent).toContain("1.000,00");
    expect(row?.textContent).toContain("Restam");
    expect(row?.textContent).toContain("1 lançamento");
  });

  it("transferência não entra no gasto da meta", () => {
    open();
    const food = screen.getByRole("progressbar", { name: "Meta de Alimentação" }).closest("li");
    // R$ 900 de transferência ficam de fora: 85% e não 175%.
    expect(food?.textContent).toContain("85%");
  });

  it("passar da meta destaca sem bloquear: diz quanto passou", () => {
    open();
    const fun = screen.getByRole("progressbar", { name: "Meta de Lazer" });
    expect(fun.getAttribute("aria-valuenow")).toBe("100");
    expect(fun.getAttribute("aria-valuetext")).toBe("Meta estourada: 175% usado");
    expect(fun.closest("li")?.textContent).toContain("Passou");
    expect(fun.closest("li")?.textContent).toContain("150,00");
  });

  it("categoria com gasto e sem meta aparece à parte, com convite", () => {
    open();
    const semMeta = within(screen.getByRole("region", { name: "Gastos sem meta" }));
    expect(semMeta.getByText("Pet")).toBeDefined();
    expect(semMeta.getByRole("button", { name: "Definir meta para Pet" })).toBeDefined();
    // "Sem categoria" aparece, mas não oferece meta.
    expect(semMeta.getByText("Sem categoria")).toBeDefined();
    expect(semMeta.queryByRole("button", { name: /Sem categoria/ })).toBeNull();
  });

  it("estado vazio convida a definir a primeira meta", () => {
    open({ state: { ...state, budgets: {} }, items: [] });
    expect(
      screen.getByRole("heading", { name: "Defina quanto gastar por categoria" }),
    ).toBeDefined();
    expect(screen.queryByRole("list", { name: "Metas" })).toBeNull();
  });

  it("define a meta de uma categoria sem meta pelo convite", () => {
    const store = open();
    fireEvent.click(screen.getByRole("button", { name: "Definir meta para Pet" }));

    expect((screen.getByRole("radio", { name: "Pet" }) as HTMLInputElement).checked).toBe(true);
    // Quem já tem meta não é oferecido de novo.
    expect(screen.queryByRole("radio", { name: "Alimentação" })).toBeNull();

    fireEvent.input(screen.getByLabelText("Limite por mês"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    expect(store.set).toHaveBeenCalledWith("PET", 15_000);
  });

  it("cria uma meta nova escolhendo a categoria", () => {
    const store = open();
    fireEvent.click(screen.getByRole("button", { name: "Meta" }));

    expect(
      (screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Pet" }));
    fireEvent.input(screen.getByLabelText("Limite por mês"), { target: { value: "20000" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    expect(store.set).toHaveBeenCalledWith("PET", 20_000);
  });

  it("edita a meta existente já com o valor atual no campo", () => {
    const store = open();
    fireEvent.click(screen.getByRole("button", { name: "Editar meta de Alimentação" }));

    const field = screen.getByLabelText("Limite por mês") as HTMLInputElement;
    expect(field.value).toBe("1.000,00");
    fireEvent.input(field, { target: { value: "120000" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    expect(store.set).toHaveBeenCalledWith("FOOD", 120_000);
  });

  it("o campo do limite recusa letras", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Meta" }));
    const field = screen.getByLabelText("Limite por mês") as HTMLInputElement;
    fireEvent.input(field, { target: { value: "12ab" } });
    expect(field.value).toBe("0,12");
  });

  it("ocultar valores esconde os números, e a barra não lê reais", () => {
    hideValues.value = true;
    open();
    const row = screen.getByRole("progressbar", { name: "Meta de Alimentação" }).closest("li");
    expect(row?.textContent).not.toContain("850");
    expect(row?.textContent).not.toContain("1.000");
    expect(
      screen
        .getByRole("progressbar", { name: "Meta de Alimentação" })
        .getAttribute("aria-valuetext"),
    ).toBe("85% da meta usada");
  });

  it("o seletor de mês recalcula: agosto não tem gasto", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    const food = screen.getByRole("progressbar", { name: "Meta de Alimentação" });
    expect(food.getAttribute("aria-valuenow")).toBe("0");
    expect(screen.queryByRole("region", { name: "Gastos sem meta" })).toBeNull();
  });
});
