import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppState, EMPTY_APP_STATE } from "../../domain/model/app-state";
import type { Asset } from "../../domain/model/asset";
import type { Debt } from "../../domain/model/debt";
import { ALIVE, DELETED_AT } from "../../domain/model/row.fake";
import { BusinessPage } from "./business-page";

afterEach(cleanup);

const TODAY = "2026-11-11";

/** O `Intl` separa "R$" do número com espaço rígido. */
const nb = (text: string) => text.replace(/ /g, " ");

function asset(id: string, kind: string, name: string, valueMinor: number, acquiredOn: string) {
  return {
    ...ALIVE,
    id,
    kind: kind as Asset["kind"],
    name,
    valueMinor,
    acquiredOn,
    book: "business" as const,
  } satisfies Asset;
}

function debt(id: string, name: string, extra: Partial<Debt> = {}): Debt {
  return {
    ...ALIVE,
    id,
    name,
    principalMinor: 900_000,
    balanceMinor: 700_000,
    book: "business",
    ...extra,
  };
}

function stateOf(assets: Asset[], debts: Debt[]): AppState {
  return {
    ...EMPTY_APP_STATE,
    assets: Object.fromEntries(assets.map((a) => [a.id, a])),
    debts: Object.fromEntries(debts.map((d) => [d.id, d])),
  };
}

function renderPage(state: AppState) {
  const handlers = {
    onNewAsset: vi.fn(),
    onEditAsset: vi.fn(),
    onNewDebt: vi.fn(),
    onEditDebt: vi.fn(),
  };
  render(<BusinessPage state={state} today={TODAY} {...handlers} />);
  return handlers;
}

const FULL = stateOf(
  [
    asset("a1", "investment", "CDB", 1_000_000, "2026-09-01"),
    asset("a2", "inventory", "Farinha", 300_000, "2026-10-20"),
    asset("a3", "equipment", "Forno", 450_000, "2026-08-01"),
    asset("a4", "equipment", "Batedeira", 50_000, "2025-12-05"),
    asset("a5", "equipment", "Apagado", 999_999, "2026-08-01"),
  ].map((a) => (a.id === "a5" ? { ...a, deletedAt: DELETED_AT } : a)),
  [
    debt("d1", "Financiamento do forno", {
      creditor: "Banco do Povo",
      dueOn: "2026-12-10",
    }),
    debt("d2", "Fornecedor", {
      creditor: "Moinho",
      dueOn: "2026-10-01",
      principalMinor: 50_000,
      balanceMinor: 20_000,
    }),
    debt("d3", "Cheque especial", { principalMinor: 10_000, balanceMinor: 0 }),
    debt("d4", "Apagada", { deletedAt: DELETED_AT }),
  ],
);

describe("BusinessPage", () => {
  it("resume o capital por tipo e as dívidas totais, ignorando o que foi apagado", () => {
    renderPage(FULL);
    // 1.000.000 + 300.000 + (450.000 + 50.000) = 1.800.000
    expect(screen.getByTestId("business-capital-total").textContent).toContain("18.000");
    const resumo = within(screen.getByRole("region", { name: "Resumo do negócio" }));
    expect(resumo.getByText("Investimentos").nextSibling?.textContent).toBe(nb("R$ 10.000,00"));
    expect(resumo.getByText("Estoque").nextSibling?.textContent).toBe(nb("R$ 3.000,00"));
    expect(resumo.getByText("Equipamentos").nextSibling?.textContent).toBe(nb("R$ 5.000,00"));
    // Saldos: 700.000 + 20.000 + 0
    expect(screen.getByTestId("business-debt-total").textContent).toBe(nb("R$ 7.200,00"));
    expect(screen.getByText(/não entram em receitas, despesas nem no resultado/i)).toBeDefined();
  });

  it("agrupa os bens por tipo, com nome, tipo, valor e data", () => {
    renderPage(FULL);
    const equipamentos = within(screen.getByRole("region", { name: "Equipamentos" }));
    const rows = equipamentos.getAllByRole("button");
    expect(rows).toHaveLength(2);
    // Mais recente primeiro; ano só quando difere do corrente.
    expect(rows[0]?.textContent).toContain("Forno");
    expect(rows[0]?.textContent).toContain(nb("R$ 4.500,00"));
    expect(rows[0]?.textContent).toContain("Equipamento · 1 ago");
    expect(rows[1]?.textContent).toContain("Batedeira");
    expect(rows[1]?.textContent).toContain("Equipamento · 5 dez 2025");
    expect(screen.queryByText("Apagado")).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Investimentos" })).getByText("CDB"),
    ).toBeDefined();
    expect(
      within(screen.getByRole("region", { name: "Estoque" })).getByText("Farinha"),
    ).toBeDefined();
  });

  it("lista dívidas com nome, credor, saldo e vencimento; a que vence antes vem primeiro", () => {
    renderPage(FULL);
    const rows = within(screen.getByRole("region", { name: "Dívidas" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Fornecedor"),
      expect.stringContaining("Financiamento do forno"),
      expect.stringContaining("Cheque especial"),
    ]);
    // Vencida: "venceu"; no prazo: "vence"; saldo zero: "Quitada".
    expect(rows[0]?.textContent).toContain("Moinho · venceu 1 out");
    expect(rows[0]?.textContent).toContain(nb("R$ 200,00"));
    expect(rows[1]?.textContent).toContain("Banco do Povo · vence 10 dez");
    expect(rows[1]?.textContent).toContain(nb("R$ 7.000,00"));
    expect(rows[2]?.textContent).toContain("Quitada");
    expect(screen.queryByText("Apagada")).toBeNull();
  });

  it("estado vazio explica o que cadastrar e os botões abrem o cadastro", () => {
    const handlers = renderPage(stateOf([], []));
    expect(screen.getByText(/Nenhum bem ainda/)).toBeDefined();
    expect(screen.getByText(/Nenhuma dívida cadastrada/)).toBeDefined();
    expect(screen.getByTestId("business-debt-total").textContent).toBe(nb("R$ 0,00"));

    fireEvent.click(screen.getByRole("button", { name: "Novo bem" }));
    fireEvent.click(screen.getByRole("button", { name: "Nova dívida" }));
    expect(handlers.onNewAsset).toHaveBeenCalledOnce();
    expect(handlers.onNewDebt).toHaveBeenCalledOnce();
  });

  it("tocar numa linha abre a edição daquela linha", () => {
    const handlers = renderPage(FULL);
    fireEvent.click(screen.getByRole("button", { name: /Forno/ }));
    expect(handlers.onEditAsset).toHaveBeenCalledWith(expect.objectContaining({ id: "a3" }));

    fireEvent.click(screen.getByRole("button", { name: /Financiamento do forno/ }));
    expect(handlers.onEditDebt).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
  });

  it("tipo de uma versão futura aparece em Outros, sem derrubar nem entrar no capital", () => {
    renderPage(stateOf([asset("a1", "vehicle", "Furgão", 8_000_000, "2026-01-01")], []));
    expect(
      within(screen.getByRole("region", { name: "Outros" })).getByText("Furgão"),
    ).toBeDefined();
    expect(screen.getByTestId("business-capital-total").textContent).toContain("0,00");
  });
});
