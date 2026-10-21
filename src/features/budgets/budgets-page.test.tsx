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

  it("a meta vem em destaque: restante como número principal e estado em texto", () => {
    open();
    const food = screen.getByRole("progressbar", { name: "Meta de Alimentação" }).closest("li");
    expect(food?.textContent).toContain("Restam");
    expect(food?.textContent).toContain("Atenção");
    expect(food?.getAttribute("data-level")).toBe("warning");
    const fun = screen.getByRole("progressbar", { name: "Meta de Lazer" }).closest("li");
    expect(fun?.textContent).toContain("Estourou");
    expect(within(fun as HTMLElement).getByTestId("limit-marker")).toBeDefined();
  });

  it("começa recolhida e expande/recolhe os lançamentos da categoria", () => {
    open();
    const toggle = screen.getByRole("button", { name: "Lançamentos de Alimentação" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Lançamentos de Alimentação" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const list = within(screen.getByRole("list", { name: "Lançamentos de Alimentação" }));
    // Só o gasto da categoria no mês: a transferência de R$ 900 e as outras categorias ficam fora.
    expect(list.getAllByRole("listitem")).toHaveLength(1);
    expect(list.getByText("a")).toBeDefined();
    expect(list.queryByText("d")).toBeNull();
    expect(list.queryByText("b")).toBeNull();
    expect(list.getByText("2 set")).toBeDefined();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Lançamentos de Alimentação" })).toBeNull();
  });

  it("mostra os 3 mais recentes e 'Ver todos (N)' abre o resto", () => {
    const many = [
      tx("m1", "expense", 1_000, "2026-09-01", "FOOD"),
      tx("m2", "expense", 1_000, "2026-09-02", "FOOD"),
      tx("m3", "expense", 1_000, "2026-09-03", "FOOD"),
      tx("m4", "expense", 1_000, "2026-09-04", "FOOD"),
      tx("m5", "expense", 1_000, "2026-08-31", "FOOD"),
    ];
    open({ items: many });
    fireEvent.click(screen.getByRole("button", { name: "Lançamentos de Alimentação" }));
    const list = () => within(screen.getByRole("list", { name: "Lançamentos de Alimentação" }));
    expect(
      list()
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining("m4"),
      expect.stringContaining("m3"),
      expect.stringContaining("m2"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Ver todos (4)" }));
    // m5 é de agosto: não é do mês selecionado.
    expect(list().getAllByRole("listitem")).toHaveLength(4);
    expect(list().queryByText("m5")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver menos" }));
    expect(list().getAllByRole("listitem")).toHaveLength(3);
  });

  it("ocultar valores esconde também o valor de cada lançamento", () => {
    hideValues.value = true;
    open();
    fireEvent.click(screen.getByRole("button", { name: "Lançamentos de Alimentação" }));
    const list = screen.getByRole("list", { name: "Lançamentos de Alimentação" });
    expect(list.textContent).not.toContain("850");
  });

  it("expandir não abre o formulário; o lápis edita", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Lançamentos de Alimentação" }));
    expect(screen.queryByLabelText("Limite por mês")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Editar meta de Alimentação" }));
    expect(screen.getByLabelText("Limite por mês")).toBeDefined();
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

    // A categoria já veio do convite: abre direto no limite, com a etapa 1 acessível.
    fireEvent.click(screen.getByRole("button", { name: "Etapa anterior" }));
    expect((screen.getByRole("radio", { name: "Pet" }) as HTMLInputElement).checked).toBe(true);
    // Quem já tem meta não é oferecido de novo.
    expect(screen.queryByRole("radio", { name: "Alimentação" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));

    fireEvent.input(screen.getByLabelText("Limite por mês"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    expect(store.set).toHaveBeenCalledWith("PET", 15_000);
  });

  it("cria uma meta nova passando pelas três etapas", () => {
    const store = open();
    fireEvent.click(screen.getByRole("button", { name: "Meta" }));

    // Sem categoria não dá para avançar, e salvar só existe na prévia.
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByRole("button", { name: "Salvar meta" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Pet" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    // Sem limite também não avança.
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.input(screen.getByLabelText("Limite por mês"), { target: { value: "20000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.queryByLabelText("Limite por mês")).toBeNull();
    expect(store.set).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    expect(store.set).toHaveBeenCalledWith("PET", 20_000);
  });

  it("a prévia compara o gasto do mês com o novo limite", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Definir meta para Pet" }));
    // Pet gastou R$ 120,00 em setembro: com limite de R$ 100,00 estoura.
    fireEvent.input(screen.getByLabelText("Limite por mês"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    const preview = screen.getByRole("progressbar", { name: "Prévia da meta de Pet" });
    expect(preview.getAttribute("aria-valuetext")).toBe("Meta estourada: 120% usado");
    const text = preview.closest("div.rounded-lg")?.textContent ?? "";
    expect(text).toContain("120,00");
    expect(text).toContain("100,00");
    expect(text).toContain("120%");
    expect(text).toContain("Passaria");
  });

  it("a prévia respeita ocultar valores", () => {
    hideValues.value = true;
    open();
    fireEvent.click(screen.getByRole("button", { name: "Definir meta para Pet" }));
    fireEvent.input(screen.getByLabelText("Limite por mês"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    const preview = screen.getByRole("progressbar", { name: "Prévia da meta de Pet" });
    const text = preview.closest("div.rounded-lg")?.textContent ?? "";
    expect(text).not.toContain("120,00");
    expect(text).not.toContain("100,00");
  });

  it("edita a meta existente já com o valor atual e a categoria travada", () => {
    const store = open();
    fireEvent.click(screen.getByRole("button", { name: "Editar meta de Alimentação" }));

    const field = screen.getByLabelText("Limite por mês") as HTMLInputElement;
    expect(field.value).toBe("1.000,00");

    // A categoria aparece, mas só ela: não dá para trocar.
    fireEvent.click(screen.getByRole("button", { name: "Etapa anterior" }));
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));

    fireEvent.input(screen.getByLabelText("Limite por mês"), { target: { value: "120000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    expect(store.set).toHaveBeenCalledWith("FOOD", 120_000);
  });

  it("o campo do limite recusa letras", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Definir meta para Pet" }));
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
