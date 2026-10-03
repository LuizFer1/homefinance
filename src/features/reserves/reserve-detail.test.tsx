import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../domain/model/category";
import { ALIVE, DELETED_AT } from "../../domain/model/row.fake";
import type { User } from "../../domain/model/user";
import { movement, reserve, stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { ReserveDetail } from "./reserve-detail";

const EMERGENCY_ID = "01J9F3K2M7QX8YB4TVWZ0DCEH1";
const NO_TARGET_ID = "01J9F3K2M7QX8YB4TVWZ0DCEH2";
const MOR = "01J9F3K2M7QX8YB4TVWZ0DCEH3";
const ANA = "01J9F3K2M7QX8YB4TVWZ0DCEH4";
const LUIZ = "01J9F3K2M7QX8YB4TVWZ0DCEH5";
const EMPTY_ID = "01J9F3K2M7QX8YB4TVWZ0DCEH6";

const MORADIA: Category = {
  ...ALIVE,
  id: MOR,
  name: "Moradia",
  icon: "house",
  color: "sky",
  kind: "expense",
};

const user = (id: string, name: string, color: User["color"]): User => ({
  ...ALIVE,
  id,
  name,
  color,
  avatar: null,
});

// Mar–Ago/2026 a R$ 3.950: custo essencial de R$ 3.950, meta de R$ 23.700.
const HISTORY = ["03", "04", "05", "06", "07", "08"].map((m) =>
  tx(`h${m}`, "expense", 395_000, `2026-${m}-05`, MOR),
);

const base = stateOf({
  transactions: HISTORY,
  reserves: [
    reserve(EMERGENCY_ID, {
      kind: "emergency",
      name: "Reserva de emergência",
      icon: "lifebuoy",
      color: "violet",
      multiple: 6,
      essentialCategoryIds: [MOR],
      recurring: { amountMinor: 50_000, day: 6, since: "2026-05" },
    }),
    reserve(NO_TARGET_ID, { name: "Presentes", icon: "gift", color: "rose" }),
    reserve(EMPTY_ID, { name: "Vazia", targetMinor: 100_000 }),
  ],
  // Saldo da emergência: R$ 15.420,00.
  movements: [
    movement("m1", EMERGENCY_ID, 1_056_000, "2026-05-10"),
    movement("m2", EMERGENCY_ID, 50_000, "2026-08-06", { userId: LUIZ }),
    movement("m3", EMERGENCY_ID, -64_000, "2026-08-18", {
      userId: ANA,
      description: "Conserto da geladeira",
      reason: "home",
    }),
    movement("m4", EMERGENCY_ID, 500_000, "2026-09-06", { userId: LUIZ, recurring: true }),
    movement("p1", NO_TARGET_ID, 8_000, "2026-09-01"),
  ],
});

const STATE = {
  ...base,
  categories: { [MOR]: MORADIA },
  users: { [ANA]: user(ANA, "Ana", "rose"), [LUIZ]: user(LUIZ, "Luiz", "sky") },
};

const noop = {
  onBack: vi.fn(),
  onEdit: vi.fn(),
  onDeposit: vi.fn(),
  onWithdraw: vi.fn(),
  onOpenMovement: vi.fn(),
};

describe("ReserveDetail", () => {
  afterEach(cleanup);

  it("emergência: meta, custo, ritmo e conclusão prevista", () => {
    render(<ReserveDetail state={STATE} reserveId={EMERGENCY_ID} today="2026-09-20" {...noop} />);
    expect(screen.getByRole("heading", { name: "Reserva de emergência" })).toBeDefined();
    expect(screen.getByText(/de R\$\s?23\.700,00 · 65% da meta/)).toBeDefined();
    expect(screen.getByText("Custo essencial")).toBeDefined();
    expect(screen.getByText(/R\$\s?3\.950\/mês/)).toBeDefined();
    expect(screen.getByText("Todo dia 6, do saldo do mês")).toBeDefined();
    expect(screen.getByText("fev 2028")).toBeDefined();
    // Posição atual no lugar do inteiro de baixo.
    expect(screen.getByText("3,9")).toBeDefined();
  });

  it("custo informado à mão diz de onde veio", () => {
    const state = {
      ...STATE,
      reserves: {
        ...STATE.reserves,
        [EMERGENCY_ID]: {
          ...(STATE.reserves[EMERGENCY_ID] as (typeof STATE.reserves)[string]),
          essentialOverrideMinor: 400_000,
        },
      },
    };
    render(<ReserveDetail state={state} reserveId={EMERGENCY_ID} today="2026-09-20" {...noop} />);
    expect(screen.getByText("Valor informado por você")).toBeDefined();
  });

  it("lista 3 movimentos e 'Ver todos' expande; retirada em cor de despesa", () => {
    render(<ReserveDetail state={STATE} reserveId={EMERGENCY_ID} today="2026-09-20" {...noop} />);
    expect(screen.getAllByTestId("movement-row")).toHaveLength(3);
    expect(screen.getByText(/Ana · 18 ago/)).toBeDefined();
    expect(screen.getByText("Mensal")).toBeDefined();
    expect(screen.getByText("Conserto da geladeira")).toBeDefined();
    expect(screen.getByText(/−R\$\s?640,00/).className).toContain("text-expense-fg");
    fireEvent.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(screen.getAllByTestId("movement-row")).toHaveLength(4);
  });

  it("sem 'Ver todos' com até 3 movimentos", () => {
    render(<ReserveDetail state={STATE} reserveId={NO_TARGET_ID} today="2026-09-20" {...noop} />);
    expect(screen.queryByRole("button", { name: "Ver todos" })).toBeNull();
  });

  it("caixinha sem meta: sem medidor de meses nem custo essencial", () => {
    render(<ReserveDetail state={STATE} reserveId={NO_TARGET_ID} today="2026-09-20" {...noop} />);
    expect(screen.queryByText("Custo essencial")).toBeNull();
    expect(screen.queryByText(/da meta/)).toBeNull();
    expect(screen.queryByText("meses")).toBeNull();
  });

  it("caixinha com meta e prazo", () => {
    const state = {
      ...STATE,
      reserves: {
        ...STATE.reserves,
        [NO_TARGET_ID]: {
          ...(STATE.reserves[NO_TARGET_ID] as (typeof STATE.reserves)[string]),
          targetMinor: 40_000,
          deadline: "2027-07",
        },
      },
    };
    render(<ReserveDetail state={state} reserveId={NO_TARGET_ID} today="2026-09-20" {...noop} />);
    expect(screen.getByText(/de R\$\s?400,00 · 20% da meta/)).toBeDefined();
    expect(screen.getByText("Prazo · jul 2027")).toBeDefined();
  });

  it("botões chamam os callbacks", () => {
    const cbs = {
      onDeposit: vi.fn(),
      onWithdraw: vi.fn(),
      onEdit: vi.fn(),
      onBack: vi.fn(),
      onOpenMovement: vi.fn(),
    };
    render(<ReserveDetail state={STATE} reserveId={EMERGENCY_ID} today="2026-09-20" {...cbs} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: /Reservas/ }));
    fireEvent.click(screen.getAllByTestId("movement-row")[0] as HTMLElement);
    expect(cbs.onDeposit).toHaveBeenCalled();
    expect(cbs.onWithdraw).toHaveBeenCalled();
    expect(cbs.onEdit).toHaveBeenCalled();
    expect(cbs.onBack).toHaveBeenCalled();
    expect(cbs.onOpenMovement).toHaveBeenCalledWith(expect.objectContaining({ id: "m4" }));
  });

  it("Retirar fica desativado com saldo zero", () => {
    render(<ReserveDetail state={STATE} reserveId={EMPTY_ID} today="2026-09-20" {...noop} />);
    expect((screen.getByRole("button", { name: "Retirar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("reserva inexistente ou apagada não renderiza nada", () => {
    const deleted = {
      ...STATE,
      reserves: {
        ...STATE.reserves,
        [NO_TARGET_ID]: {
          ...(STATE.reserves[NO_TARGET_ID] as (typeof STATE.reserves)[string]),
          deletedAt: DELETED_AT,
        },
      },
    };
    const a = render(
      <ReserveDetail state={deleted} reserveId={NO_TARGET_ID} today="2026-09-20" {...noop} />,
    );
    expect(a.container.innerHTML).toBe("");
    cleanup();
    const b = render(<ReserveDetail state={STATE} reserveId="NOPE" today="2026-09-20" {...noop} />);
    expect(b.container.innerHTML).toBe("");
  });
});
