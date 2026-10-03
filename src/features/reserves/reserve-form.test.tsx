import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../domain/model/category";
import { ALIVE } from "../../domain/model/row.fake";
import { reserve, stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { ReserveForm, type ReserveFormProps } from "./reserve-form";

afterEach(cleanup);

const EMERGENCY = reserve("01J9F3K2M7QX8YB4TVWZ0DCEH1", {
  kind: "emergency",
  name: "Reserva de emergência",
  icon: "lifebuoy",
  color: "violet",
  multiple: 6,
  essentialOverrideMinor: 400_000,
  recurring: { amountMinor: 50_000, day: 6, since: "2026-05" },
});
const MOR = "01J9F3K2M7QX8YB4TVWZ0DCEH3";
const MORADIA: Category = {
  ...ALIVE,
  id: MOR,
  name: "Moradia",
  icon: "house",
  color: "sky",
  kind: "expense",
};
const HISTORY = ["03", "04", "05", "06", "07", "08"].map((m) =>
  tx(`h${m}`, "expense", 395_000, `2026-${m}-05`, MOR),
);
const WITH_HISTORY = { ...stateOf({ transactions: HISTORY }), categories: { [MOR]: MORADIA } };
const WITH_EMERGENCY = stateOf({ reserves: [EMERGENCY] });

function mount(props: Partial<ReserveFormProps> = {}) {
  const handlers = { onSubmit: vi.fn(), onDelete: vi.fn(), onCancel: vi.fn() };
  render(
    <ReserveForm
      state={WITH_EMERGENCY}
      today="2026-09-20"
      editing={null}
      initialKind="goal"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("ReserveForm", () => {
  it("Emergência desativada quando já existe; nome obrigatório", () => {
    mount();
    const emergencia = screen.getByRole("radio", { name: /Emergência/ }) as HTMLInputElement;
    expect(emergencia.disabled).toBe(true);
    expect(screen.getByText("Você já tem uma")).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Criar reserva" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("meta + prazo mostram a sugestão; ligar a sugestão manda recurringAmountMinor", () => {
    const { onSubmit } = mount();
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "Notebook novo" } });
    fireEvent.click(screen.getByRole("radio", { name: "laptop" }));
    fireEvent.input(screen.getByLabelText("Meta"), { target: { value: "500000" } });
    fireEvent.input(screen.getByLabelText("Até quando"), { target: { value: "2027-06" } });
    expect(screen.getByText(/Guardar R\$\s?556 todo mês/)).toBeDefined();
    expect(screen.getByText("9 depósitos chegam lá em jun 2027")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Criar reserva" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "goal",
        name: "Notebook novo",
        icon: "laptop",
        targetMinor: 500_000,
        deadline: "2027-06",
        recurringAmountMinor: 55_600,
      }),
    );
  });

  it("desligar a sugestão manda recurringAmountMinor null", () => {
    const { onSubmit } = mount();
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "X" } });
    fireEvent.input(screen.getByLabelText("Meta"), { target: { value: "500000" } });
    fireEvent.input(screen.getByLabelText("Até quando"), { target: { value: "2027-06" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /todo mês/ }));
    fireEvent.click(screen.getByRole("button", { name: "Criar reserva" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recurringAmountMinor: null }));
  });

  it("sem prazo: sem card de sugestão", () => {
    mount();
    fireEvent.input(screen.getByLabelText("Meta"), { target: { value: "500000" } });
    expect(screen.queryByText(/todo mês/)).toBeNull();
  });

  it("Mais ícones abre o catálogo completo", () => {
    mount();
    expect(screen.queryByRole("radio", { name: "baby" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mais ícones" }));
    expect(screen.getByRole("radio", { name: "baby" })).toBeDefined();
  });

  it("editar emergência: só múltiplo e depósito mensal, e excluir com aviso", () => {
    const { onSubmit } = mount({ editing: EMERGENCY, initialKind: "emergency" });
    expect(screen.queryByLabelText("Nome")).toBeNull();
    expect(screen.queryByRole("radio", { name: /Caixinha/ })).toBeNull();
    // O Segmented é um fieldset (role "group"), não um radiogroup.
    expect(screen.getByRole("group", { name: /meses/i })).toBeDefined();
    expect(screen.getByLabelText("Valor por mês")).toBeDefined();
    expect(screen.getByLabelText("Custo essencial por mês")).toBeDefined();
    expect(screen.getByText("O saldo volta para o mês atual")).toBeDefined();
    fireEvent.click(screen.getByRole("radio", { name: "12 meses" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "emergency",
      name: "",
      icon: "lifebuoy",
      color: "violet",
      targetMinor: null,
      multiple: 12,
      essentialOverrideMinor: 400_000,
      deadline: null,
      recurringAmountMinor: 50_000,
    });
  });

  it("editar emergência sem override e sem histórico: o campo de custo aparece", () => {
    const calc = { ...EMERGENCY, essentialOverrideMinor: null };
    // Sem categorias essenciais o custo não existe e o campo tem de aparecer.
    mount({ editing: calc, initialKind: "emergency", state: stateOf({ reserves: [calc] }) });
    expect(screen.getByLabelText("Custo essencial por mês")).toBeDefined();
  });

  it("editar caixinha: preenche os campos e mantém o valor mensal gravado", () => {
    const goal = reserve("01J9F3K2M7QX8YB4TVWZ0DCEH2", {
      name: "Viagem",
      icon: "car",
      color: "amber",
      targetMinor: 500_000,
      deadline: "2027-06",
      recurring: { amountMinor: 30_000, day: 6, since: "2026-10" },
    });
    const { onSubmit } = mount({
      editing: goal,
      initialKind: "goal",
      state: stateOf({ reserves: [goal] }),
    });
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Viagem");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Viagem", icon: "car", recurringAmountMinor: 30_000 }),
    );
  });

  const GOAL = reserve("01J9F3K2M7QX8YB4TVWZ0DCEH2", {
    name: "Viagem",
    icon: "car",
    color: "amber",
    recurring: { amountMinor: 30_000, day: 6, since: "2026-10" },
  });
  const goalState = stateOf({ reserves: [GOAL] });

  it("renomear caixinha com depósito e sem meta nem prazo mantém o depósito", () => {
    const { onSubmit } = mount({ editing: GOAL, state: goalState });
    expect(screen.getByText(/Guardando R\$\s?300 todo mês/)).toBeDefined();
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "Viagem longa" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Viagem longa", recurringAmountMinor: 30_000 }),
    );
  });

  it("meta atingida mantém o depósito gravado", () => {
    const reached = { ...GOAL, targetMinor: 100_000, deadline: "2027-06" };
    const { onSubmit } = mount({ editing: reached, state: stateOf({ reserves: [reached] }) });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ recurringAmountMinor: 30_000 }),
    );
  });

  it("limpar o prazo mantém o depósito gravado", () => {
    const withDeadline = { ...GOAL, targetMinor: 500_000, deadline: "2027-06" };
    const { onSubmit } = mount({
      editing: withDeadline,
      state: stateOf({ reserves: [withDeadline] }),
    });
    fireEvent.input(screen.getByLabelText("Até quando"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ recurringAmountMinor: 30_000 }),
    );
  });

  it("desligar o toggle de um depósito gravado manda null", () => {
    const { onSubmit } = mount({ editing: GOAL, state: goalState });
    fireEvent.click(screen.getByRole("checkbox", { name: /todo mês/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recurringAmountMinor: null }));
  });

  it("um depósito chega lá, no singular", () => {
    mount();
    fireEvent.input(screen.getByLabelText("Meta"), { target: { value: "100000" } });
    fireEvent.input(screen.getByLabelText("Até quando"), { target: { value: "2026-10" } });
    expect(screen.getByText("1 depósito chega lá em out 2026")).toBeDefined();
  });

  it("criar emergência com histórico: sem campo de custo, mostra o custo e a meta", () => {
    const { onSubmit } = mount({ state: WITH_HISTORY, initialKind: "emergency" });
    expect(screen.queryByLabelText("Custo essencial por mês")).toBeNull();
    expect(screen.getByText("Pelos seus lançamentos")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Criar reserva" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "emergency", multiple: 6, essentialOverrideMinor: null }),
    );
  });

  it("criar emergência sem histórico: custo obrigatório", () => {
    const { onSubmit } = mount({ state: stateOf({}), initialKind: "emergency" });
    const create = screen.getByRole("button", { name: "Criar reserva" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.input(screen.getByLabelText("Custo essencial por mês"), {
      target: { value: "400000" },
    });
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ essentialOverrideMinor: 400_000 }),
    );
  });

  it("editar emergência: o custo digitado não pode ficar vazio sem histórico", () => {
    mount({ editing: EMERGENCY, initialKind: "emergency" });
    fireEvent.input(screen.getByLabelText("Custo essencial por mês"), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("depósito mensal ligado sem valor desativa Salvar e orienta", () => {
    const { recurring: _, ...rest } = EMERGENCY;
    const bare = { ...rest, recurring: null };
    mount({ editing: bare, initialKind: "emergency", state: stateOf({ reserves: [bare] }) });
    fireEvent.click(screen.getByRole("checkbox", { name: /Guardar todo mês/ }));
    expect(screen.getByText("Digite o valor por mês")).toBeDefined();
    expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("voltar e Cancelar chamam onCancel; a lixeira chama onDelete", () => {
    const { onCancel, onDelete } = mount({ editing: GOAL, state: goalState });
    fireEvent.click(screen.getByRole("button", { name: /Reservas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByRole("button", { name: /Excluir Viagem/ }));
    vi.advanceTimersByTime(5000);
    vi.useRealTimers();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("Mais ícones alterna com aria-expanded", () => {
    mount();
    const toggle = screen.getByRole("button", { name: "Mais ícones" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Menos ícones" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });
});
