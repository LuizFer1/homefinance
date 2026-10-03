import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reserve, stateOf } from "../../domain/reserves/fixtures.fake";
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
        recurringAmountMinor: 55_556,
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
});
