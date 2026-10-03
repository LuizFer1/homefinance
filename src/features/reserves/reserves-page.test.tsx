import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../domain/model/category";
import { ALIVE } from "../../domain/model/row.fake";
import { movement, reserve, stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { ReservesPage } from "./reserves-page";

const EMERGENCY_ID = "01J9F3K2M7QX8YB4TVWZ0DCEH1";
const GOAL_ID = "01J9F3K2M7QX8YB4TVWZ0DCEH2";
const MOR = "01J9F3K2M7QX8YB4TVWZ0DCEH3";

const MORADIA: Category = {
  ...ALIVE,
  id: MOR,
  name: "Moradia",
  icon: "house",
  color: "sky",
  kind: "expense",
};

// Mar–Ago/2026 a R$ 3.950 cada: média de 6 meses cheios, custo essencial de R$ 3.950.
const HISTORY = ["03", "04", "05", "06", "07", "08"].map((m) =>
  tx(`h${m}`, "expense", 395_000, `2026-${m}-05`, MOR),
);

const withCategory = (state: ReturnType<typeof stateOf>) => ({
  ...state,
  categories: { [MOR]: MORADIA },
});

// Emergência: 10.000 + 4.420 + 1.000 (set) = R$ 15.420. Caixinha: R$ 4.200.
const STATE = withCategory(
  stateOf({
    transactions: HISTORY,
    reserves: [
      reserve(EMERGENCY_ID, {
        kind: "emergency",
        name: "Reserva de emergência",
        icon: "lifebuoy",
        color: "violet",
        multiple: 6,
        essentialCategoryIds: [MOR],
      }),
      reserve(GOAL_ID, {
        name: "Viagem de julho",
        icon: "airplane-tilt",
        color: "sky",
        targetMinor: 600_000,
        deadline: "2027-07",
      }),
    ],
    movements: [
      movement("m1", EMERGENCY_ID, 1_000_000, "2026-05-10"),
      movement("m2", EMERGENCY_ID, 442_000, "2026-08-10"),
      movement("m3", EMERGENCY_ID, 100_000, "2026-09-05"),
      movement("m4", GOAL_ID, 420_000, "2026-08-12"),
    ],
  }),
);

const ONLY_TRANSACTIONS = withCategory(stateOf({ transactions: HISTORY }));

const noop = {
  onOpen: vi.fn(),
  onNew: vi.fn(),
  onCreateEmergency: vi.fn(),
};

describe("ReservesPage", () => {
  afterEach(cleanup);

  it("mostra total separado, emergência com meses e caixinhas", () => {
    render(<ReservesPage state={STATE} today="2026-09-20" {...noop} />);
    expect(screen.getByRole("heading", { name: "Reservas" })).toBeDefined();
    expect(screen.getByTestId("reserves-total").textContent).toContain("19.620");
    expect(screen.getByText(/R\$\s?1\.000,00 guardados em setembro/)).toBeDefined();
    expect(screen.getByText("Cobre 3,9 meses")).toBeDefined();
    expect(screen.getByText(/faltam R\$\s?8\.280/)).toBeDefined();
    expect(screen.getByText("Viagem de julho")).toBeDefined();
    expect(screen.getByText(/Faltam R\$\s?1\.800 · até jul 2027/)).toBeDefined();
  });

  it("tocar na emergência abre o detalhe; + Nova abre o formulário de caixinha", () => {
    const onOpen = vi.fn();
    const onNew = vi.fn();
    render(
      <ReservesPage state={STATE} today="2026-09-20" {...noop} onOpen={onOpen} onNew={onNew} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reserva de emergência/ }));
    expect(onOpen).toHaveBeenCalledWith(EMERGENCY_ID);
    fireEvent.click(screen.getByRole("button", { name: "Nova" }));
    expect(onNew).toHaveBeenCalledWith("goal");
  });

  it("emergência duplicada vira caixinha com aviso", () => {
    const state = {
      ...STATE,
      reserves: {
        ...STATE.reserves,
        Z: reserve("01J9F3K2M7QX8YB4TVWZ0DCEZZ", { kind: "emergency", multiple: 6 }),
      },
    };
    render(<ReservesPage state={state} today="2026-09-20" {...noop} />);
    expect(
      screen.getByText("Reserva de emergência duplicada (criada em outro aparelho)"),
    ).toBeDefined();
  });

  it("vazio: sugere a meta pelos lançamentos e cria a emergência com o múltiplo", () => {
    const onCreateEmergency = vi.fn();
    render(
      <ReservesPage
        state={ONLY_TRANSACTIONS}
        today="2026-09-20"
        {...noop}
        onCreateEmergency={onCreateEmergency}
      />,
    );
    expect(screen.getByText("Comece pela reserva de emergência")).toBeDefined();
    expect(screen.getByTestId("suggested-target").textContent).toContain("23.700");
    fireEvent.click(screen.getByRole("radio", { name: "12 meses" }));
    expect(screen.getByTestId("suggested-target").textContent).toContain("47.400");
    fireEvent.click(screen.getByRole("button", { name: "Criar reserva de emergência" }));
    expect(onCreateEmergency).toHaveBeenCalledWith(12, null);
  });

  it("vazio: criar só uma caixinha chama onNew('goal')", () => {
    const onNew = vi.fn();
    render(<ReservesPage state={ONLY_TRANSACTIONS} today="2026-09-20" {...noop} onNew={onNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Criar só uma caixinha" }));
    expect(onNew).toHaveBeenCalledWith("goal");
  });

  it("vazio sem histórico: pede o custo à mão", () => {
    const onCreateEmergency = vi.fn();
    render(
      <ReservesPage
        state={stateOf({})}
        today="2026-09-20"
        {...noop}
        onCreateEmergency={onCreateEmergency}
      />,
    );
    const create = screen.getByRole("button", { name: "Criar reserva de emergência" });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    fireEvent.input(screen.getByLabelText("Quanto você gasta com o essencial por mês?"), {
      target: { value: "300000" },
    });
    fireEvent.click(create);
    expect(onCreateEmergency).toHaveBeenCalledWith(6, 300_000);
  });
});

describe("ReservesPage — bordas", () => {
  afterEach(cleanup);

  it("histórico sem gasto essencial cai no campo manual", () => {
    const onCreateEmergency = vi.fn();
    const state = stateOf({
      transactions: [tx("x1", "expense", 50_000, "2026-05-05", "OUTRA")],
    });
    render(
      <ReservesPage
        state={state}
        today="2026-09-20"
        {...noop}
        onCreateEmergency={onCreateEmergency}
      />,
    );
    fireEvent.input(screen.getByLabelText("Quanto você gasta com o essencial por mês?"), {
      target: { value: "200000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar reserva de emergência" }));
    expect(onCreateEmergency).toHaveBeenCalledWith(6, 200_000);
  });

  it("retirada líquida no mês mostra 'retirados'", () => {
    const state = stateOf({
      reserves: [reserve(GOAL_ID, { name: "Caixa" })],
      movements: [
        movement("a", GOAL_ID, 100_000, "2026-08-01"),
        movement("b", GOAL_ID, -30_000, "2026-09-02"),
      ],
    });
    render(<ReservesPage state={state} today="2026-09-20" {...noop} />);
    expect(screen.getByText(/R\$\s?300,00 retirados em setembro/)).toBeDefined();
    expect(screen.getByText("Sem meta")).toBeDefined();
  });

  it("emergência no custo máximo mostra 'Meta atingida'", () => {
    const state = {
      ...STATE,
      reserveMovements: {
        ...STATE.reserveMovements,
        big: movement("big", EMERGENCY_ID, 2_000_000, "2026-08-20"),
      },
    };
    render(<ReservesPage state={state} today="2026-09-20" {...noop} />);
    expect(screen.getByText("Meta atingida")).toBeDefined();
  });

  it("emergência sem custo calculável pede para definir o custo essencial", () => {
    const state = stateOf({
      reserves: [
        reserve(EMERGENCY_ID, { kind: "emergency", multiple: 6, essentialCategoryIds: [] }),
      ],
    });
    render(<ReservesPage state={state} today="2026-09-20" {...noop} />);
    expect(screen.getByText("Defina o custo essencial")).toBeDefined();
  });
});
