import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_APP_STATE } from "../../domain/model/app-state";
import { ALIVE } from "../../domain/model/row.fake";
import { movement, reserve, stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { DashboardPage } from "../dashboard/dashboard-page";
import { HomePage } from "../home/home-page";
import { ReservesPage } from "../reserves/reserves-page";
import { TransactionList } from "../transactions/transaction-list";
import { Money, signedBRL } from "../ui/money";
import { hideValues, initPrivacy, MASK, PRIVACY_KEY, setHideValues } from "./privacy";
import { PrivacyToggle } from "./privacy-toggle";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

beforeEach(() => initPrivacy(memoryStorage()));
afterEach(() => {
  cleanup();
  initPrivacy(memoryStorage());
});

describe("preferência", () => {
  it("nasce desligada e lê a escolha gravada", () => {
    expect(hideValues.value).toBe(false);
    initPrivacy(memoryStorage({ [PRIVACY_KEY]: "1" }));
    expect(hideValues.value).toBe(true);
  });

  it("grava ao alternar", () => {
    const storage = memoryStorage();
    initPrivacy(storage);
    setHideValues(true);
    expect(storage.data.get(PRIVACY_KEY)).toBe("1");
    setHideValues(false);
    expect(storage.data.get(PRIVACY_KEY)).toBe("0");
  });

  it("storage que lança não derruba: vale na sessão", () => {
    const quebrado = {
      getItem: () => {
        throw new Error("negado");
      },
      setItem: () => {
        throw new Error("negado");
      },
    };
    expect(() => initPrivacy(quebrado)).not.toThrow();
    expect(hideValues.value).toBe(false);
    expect(() => setHideValues(true)).not.toThrow();
    expect(hideValues.value).toBe(true);
  });
});

describe("botão", () => {
  it("alterna aria-pressed e a máscara", () => {
    render(<PrivacyToggle />);
    const botao = screen.getByRole("button", { name: "Ocultar valores" });
    expect(botao.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(botao);
    expect(botao.getAttribute("aria-pressed")).toBe("true");
    expect(hideValues.value).toBe(true);

    fireEvent.click(botao);
    expect(botao.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("formatadores", () => {
  it("mascaram Money e texto corrido, inclusive para leitor de tela", () => {
    setHideValues(true);
    const { container } = render(<Money minor={123_456} size={44} />);
    expect(container.textContent).not.toMatch(/\d/);
    expect(container.textContent).toContain("valor oculto");
    expect(signedBRL(-5_000, "always")).toBe(MASK);
  });
});

/** Valor em reais com centavos ou "R$ <dígito>": o que não pode aparecer. */
const LEAK = /\d{1,3}(\.\d{3})*,\d{2}|R\$\s?\d/;

function leaks(container: Element): string[] {
  const found: string[] = [];
  const nodes = [container, ...container.querySelectorAll("*")];
  for (const node of nodes) {
    const own = Array.from(node.childNodes)
      .filter((child) => child.nodeType === 3)
      .map((child) => child.textContent ?? "")
      .join("");
    const texts = [own, node.getAttribute("title"), node.getAttribute("aria-label")];
    for (const text of texts) if (text && LEAK.test(text)) found.push(text);
  }
  return found;
}

describe("com a máscara ligada nenhuma tela mostra valor", () => {
  const MOR = "01J9F3K2M7QX8YB4TVWZ0DCEH3";
  const EMERGENCY = "01J9F3K2M7QX8YB4TVWZ0DCEH1";
  const GOAL = "01J9F3K2M7QX8YB4TVWZ0DCEH2";
  const state = {
    ...stateOf({
      transactions: [
        tx("sal", "income", 650_000, "2026-09-05"),
        tx("mer", "expense", 80_050, "2026-09-08", MOR, { cashbackMinor: 801 }),
        tx("est", "expense", 12_300, "2026-09-09", MOR, { estimated: true }),
        tx("ago", "expense", 395_000, "2026-08-05", MOR),
        tx("jul", "expense", 395_000, "2026-07-05", MOR),
      ],
      reserves: [
        reserve(EMERGENCY, {
          kind: "emergency",
          name: "Reserva",
          multiple: 6,
          essentialCategoryIds: [MOR],
        }),
        reserve(GOAL, { name: "Viagem", targetMinor: 600_000, deadline: "2027-07" }),
      ],
      movements: [
        movement("m1", EMERGENCY, 1_000_000, "2026-08-10"),
        movement("m2", GOAL, 420_000, "2026-09-12"),
      ],
    }),
    categories: {
      [MOR]: {
        ...ALIVE,
        id: MOR,
        name: "Moradia",
        icon: "house",
        color: "sky" as const,
        kind: "expense" as const,
      },
    },
  };
  const items = Object.values(state.transactions).sort((a, b) =>
    a.occurredOn < b.occurredOn ? 1 : -1,
  );

  it("sanidade: desligada, as telas mostram valores", () => {
    const { container } = render(
      <TransactionList
        items={items}
        state={state}
        today="2026-09-20"
        currentUserId={null}
        onEdit={vi.fn()}
      />,
    );
    expect(leaks(container).length).toBeGreaterThan(0);
  });

  it.each([
    [
      "Home",
      () => (
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
        />
      ),
    ],
    ["Dashboard", () => <DashboardPage items={items} state={state} today="2026-09-20" />],
    [
      "Lançamentos",
      () => (
        <TransactionList
          items={items}
          state={state}
          today="2026-09-20"
          currentUserId={null}
          onEdit={vi.fn()}
        />
      ),
    ],
    [
      "Reservas",
      () => (
        <ReservesPage
          state={state}
          today="2026-09-20"
          onOpen={vi.fn()}
          onNew={vi.fn()}
          onCreateEmergency={vi.fn()}
        />
      ),
    ],
  ])("%s", (_name, view) => {
    setHideValues(true);
    const { container } = render(view());
    expect(leaks(container)).toEqual([]);
  });

  describe("sheets do Resumo", () => {
    // Os sheets só montam o corpo quando abrem: o teste da página fechada não os cobre.
    const MONTHLY = "01J9F3K2M7QX8YB4TVWZ0DCEH4";
    const series = ["Aluguel", "Luz", "Internet", "Academia"].map((description, index) => ({
      ...ALIVE,
      id: `${MONTHLY.slice(0, 25)}${index + 5}`,
      kind: "expense" as const,
      description,
      amountMinor: 23_000 + index,
      currency: "BRL" as const,
      categoryId: MOR,
      paymentMethodId: null,
      cashbackMinor: null,
      frequency: "monthly" as const,
      scheduleType: "dayOfMonth" as const,
      scheduleN: 21 + index,
      startOn: "2026-06-21",
      endOn: null,
      active: true,
      variable: index === 1,
    }));
    const others = ["A", "B", "C", "D", "E"].map((id, index) =>
      tx(`x${id}`, "expense", 1_000 + index, `2026-09-1${index}`, null, { description: id }),
    );
    const categories = Object.fromEntries(
      ["A", "B", "C", "D", "E"].map((id) => [
        id,
        { ...state.categories[MOR], id, name: `Cat ${id}` },
      ]),
    );
    const full = {
      ...state,
      categories: { ...state.categories, ...categories },
      recurrences: Object.fromEntries(series.map((row) => [row.id, row])),
      budgets: { b: { ...ALIVE, id: "b", categoryId: MOR, limitMinor: 100_000 } },
    };
    const all = [
      ...items,
      ...others.map((row, index) => ({ ...row, categoryId: ["A", "B", "C", "D", "E"][index] })),
    ] as typeof items;

    it.each([
      ["Saídas por dia", "Saídas por dia"],
      ["Últimos 6 meses", "Últimos 6 meses"],
      ["Ver todas as 6", "Todas as categorias"],
      ["Ver todas as 4", "Recorrentes a caminho"],
    ])("%s", (button, title) => {
      setHideValues(true);
      const { container } = render(<DashboardPage items={all} state={full} today="2026-09-20" />);

      expect(leaks(container)).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: button }));

      const sheet = Array.from(container.querySelectorAll("dialog")).find((item) => item.open);
      expect(sheet?.getAttribute("aria-label")).toBe(title);
      expect(
        sheet?.querySelectorAll("li, [data-testid^='heat-day-'], [data-testid^='bar-']").length,
      ).toBeGreaterThan(0);
      expect(leaks(container)).toEqual([]);
    });

    it("o dia aberto pelo calendário também não mostra valor", () => {
      setHideValues(true);
      const { container } = render(<DashboardPage items={all} state={full} today="2026-09-20" />);

      fireEvent.click(screen.getByRole("button", { name: "Saídas por dia" }));
      fireEvent.click(screen.getByTestId("heat-day-8"));

      expect(screen.getByText(/1 saída/)).toBeDefined();
      expect(leaks(container)).toEqual([]);
    });
  });

  it("estado vazio não quebra", () => {
    setHideValues(true);
    const { container } = render(
      <DashboardPage items={[]} state={EMPTY_APP_STATE} today="2026-09-20" />,
    );
    expect(leaks(container)).toEqual([]);
  });
});
