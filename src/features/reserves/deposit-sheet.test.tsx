import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Reserve } from "../../domain/model/reserve";
import { movement, reserve, stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { HOLD_MS } from "../ui/hold-button";
import { DepositSheet, type DepositSheetProps } from "./deposit-sheet";

afterEach(cleanup);

const EMERGENCY_ID = "01J9F3K2M7QX8YB4TVWZ0DCEH1";

// Custo essencial informado de R$ 3.950; saldo da reserva de R$ 15.420,00.
const EMERGENCY: Reserve = reserve(EMERGENCY_ID, {
  kind: "emergency",
  name: "Reserva de emergência",
  icon: "lifebuoy",
  multiple: 6,
  essentialOverrideMinor: 395_000,
  recurring: { amountMinor: 50_000, day: 6, since: "2026-05" },
});

const STATE = stateOf({
  transactions: [tx("salario", "income", 301_760, "2026-09-05")],
  reserves: [EMERGENCY],
  movements: [movement("m1", EMERGENCY_ID, 1_542_000, "2026-05-10")],
});

const SAVED = movement("m9", EMERGENCY_ID, 20_000, "2026-09-10", { description: "Bônus" });

function setup(extra: Partial<DepositSheetProps> = {}) {
  const props: DepositSheetProps = {
    state: STATE,
    reserve: EMERGENCY,
    today: "2026-09-20",
    editing: null,
    onSubmit: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...extra,
  };
  render(<DepositSheet {...props} />);
  return props;
}

const amount = () => screen.getByLabelText("Valor") as HTMLInputElement;
const save = () => screen.getByRole("button", { name: /Guardar R\$/ }) as HTMLButtonElement;

describe("DepositSheet", () => {
  it("mostra saldo do mês, prévia de meses e guarda o valor digitado", () => {
    const { onSubmit } = setup();
    fireEvent.input(amount(), { target: { value: "50000" } });
    expect(screen.getByText(/fica R\$\s?2\.517,60/)).toBeDefined();
    expect(screen.getByText(/cobre/).textContent).toContain("4,0 meses");
    fireEvent.click(screen.getByRole("button", { name: /Guardar R\$\s?500,00/ }));
    expect(onSubmit).toHaveBeenCalledWith(
      { amountMinor: 50_000, description: null, occurredOn: "2026-09-20" },
      undefined,
    );
  });

  it("acima do saldo do mês: aviso, mas o botão continua ativo", () => {
    setup();
    fireEvent.input(amount(), { target: { value: "999999" } });
    expect(screen.getByText("Maior que o saldo de setembro")).toBeDefined();
    expect(save().disabled).toBe(false);
  });

  it("emergência duplicada: sem prévia de meses, como caixinha", () => {
    const dup: Reserve = { ...EMERGENCY, id: "01J9F3K2M7QX8YB4TVWZ0DCEH9" };
    const state = { ...STATE, reserves: { ...STATE.reserves, [dup.id]: dup } };
    setup({ state, reserve: dup });
    fireEvent.input(amount(), { target: { value: "50000" } });
    expect(screen.getByText(/Depois:/).textContent).not.toContain("cobre");
  });

  it("valor zero deixa o botão desativado", () => {
    setup();
    expect(save().disabled).toBe(true);
  });

  it("chips somam; Sobra do mês preenche o saldo e fica desativado sem saldo", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "+100" }));
    fireEvent.click(screen.getByRole("button", { name: "+50" }));
    expect(amount().value).toBe("150,00");
    fireEvent.click(screen.getByRole("button", { name: /Sobra do mês/ }));
    expect(amount().value).toBe("3.017,60");
    cleanup();

    setup({ state: stateOf({ reserves: [EMERGENCY] }) });
    const sobra = screen.getByRole("button", { name: /Sobra do mês/ }) as HTMLButtonElement;
    expect(sobra.disabled).toBe(true);
  });

  it("ligar Guardar todo mês manda setRecurring true", () => {
    const { onSubmit } = setup({ reserve: { ...EMERGENCY, recurring: null } });
    fireEvent.input(amount(), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Guardar todo mês/ }));
    fireEvent.click(save());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 10_000 }), true);
  });

  it("desligar uma regra ativa manda setRecurring false", () => {
    const { onSubmit } = setup();
    fireEvent.input(amount(), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Guardar todo mês/ }));
    fireEvent.click(save());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 10_000 }), false);
  });

  it("dica: próximo no mês seguinte quando o dia já passou", () => {
    setup();
    expect(screen.getByText("Dia 6 · próximo em 6 out")).toBeDefined();
  });

  it("dica: com a regra ativa e o dia ainda por vir, é neste mês", () => {
    setup({ today: "2026-09-02" });
    expect(screen.getByText("Dia 6 · próximo em 6 set")).toBeDefined();
  });

  it("dica: sem regra, o dia é o de hoje", () => {
    setup({ reserve: { ...EMERGENCY, recurring: null } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Guardar todo mês/ }));
    expect(screen.getByText("Dia 20 · próximo em 20 out")).toBeDefined();
  });

  it("dica: regra com since futuro mostra o mês do since", () => {
    setup({
      reserve: { ...EMERGENCY, recurring: { amountMinor: 50_000, day: 6, since: "2026-11" } },
    });
    expect(screen.getByText("Dia 6 · próximo em 6 nov")).toBeDefined();
  });

  it("dica: some com o toggle desligado", () => {
    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /Guardar todo mês/ }));
    expect(screen.queryByText(/próximo em/)).toBeNull();
  });

  it("editar para valor que deixa a reserva negativa: erro e botão desativado", () => {
    // Saldo 15.420 + guardado 200: editar de 200 para 0,01 não cabe se já tirou o resto.
    const drained = stateOf({
      transactions: [tx("salario", "income", 301_760, "2026-09-05")],
      reserves: [EMERGENCY],
      movements: [SAVED, movement("w", EMERGENCY_ID, -20_000, "2026-09-12")],
    });
    setup({ state: drained, editing: SAVED });
    fireEvent.input(amount(), { target: { value: "10000" } });
    expect(screen.getByText("A reserva ficaria negativa")).toBeDefined();
    expect(save().disabled).toBe(true);
    expect(amount().getAttribute("aria-describedby")).toBe("deposit-error");
  });

  it("em edição: preenchido, sem toggle, mantém a data e tem Segure para excluir", () => {
    const { onSubmit, onDelete } = setup({ editing: SAVED });
    expect(screen.getByRole("heading", { name: "Editar guardado" })).toBeDefined();
    expect(amount().value).toBe("200,00");
    expect(screen.queryByRole("checkbox")).toBeNull();

    fireEvent.input(amount(), { target: { value: "25000" } });
    fireEvent.click(save());
    expect(onSubmit).toHaveBeenCalledWith(
      { amountMinor: 25_000, description: "Bônus", occurredOn: "2026-09-10" },
      undefined,
    );

    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByRole("button", { name: /excluir guardado/i }));
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    vi.useRealTimers();
    expect(onDelete).toHaveBeenCalled();
  });
});
