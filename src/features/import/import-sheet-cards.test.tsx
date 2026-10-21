import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextItem } from "../../domain/import/lines";
import { type AppState, EMPTY_APP_STATE } from "../../domain/model/app-state";
import type { PaymentMethod } from "../../domain/model/payment-method";
import { ALIVE } from "../../domain/model/row.fake";
import { ImportSheet } from "./import-sheet";

afterEach(cleanup);

function method(over: Partial<PaymentMethod> & { id: string }): PaymentMethod {
  return {
    name: over.id,
    icon: "credit-card",
    color: "violet",
    kind: "credit",
    ...ALIVE,
    ...over,
  };
}

const NUBANK = method({
  id: "CARTAO-1",
  name: "Nubank",
  bank: "Nubank",
  closingDay: 5,
  dueDay: 12,
});
const ITAU = method({
  id: "CARTAO-2",
  name: "Itaú",
  color: "orange",
  bank: "Itaú",
  closingDay: 20,
  dueDay: 28,
});
const ANTIGO = method({ id: "CARTAO-3", name: "Antigo" });
const PIX = method({ id: "PIX", name: "Pix", kind: "pix" });

const STATE: AppState = {
  ...EMPTY_APP_STATE,
  paymentMethods: Object.fromEntries([NUBANK, ITAU, ANTIGO, PIX].map((m) => [m.id, m])),
};

const LINES = ["Vencimento 10/10/2026", "12/09 IFOOD *RESTAURANTE 45,90"];

function render_(readPdf = vi.fn()) {
  const onImport = vi.fn().mockResolvedValue({ transactions: 1, series: 0 });
  render(
    <ImportSheet
      state={STATE}
      today="2026-10-01"
      readPdf={readPdf}
      onImport={onImport}
      onClose={vi.fn()}
    />,
  );
  return { onImport };
}

describe("importação de PDF com vários cartões", () => {
  it("oferece cada cartão de crédito, e nada além deles", () => {
    render_();

    const values = screen
      .getAllByRole("radio", { name: /Nubank|Itaú|Antigo|Pix/ })
      .map((option) => (option as HTMLInputElement).value)
      .sort();
    expect(values).toEqual(["CARTAO-1", "CARTAO-2", "CARTAO-3"]);
  });

  it("completos vêm antes dos por completar, o primeiro já escolhido, com o ciclo à vista", () => {
    render_();

    expect((screen.getByRole("radio", { name: "Itaú" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Fecha dia 20 · vence dia 28")).toBeDefined();
  });

  it("o cartão escolhido é o que recebe os lançamentos importados", async () => {
    const items: TextItem[] = LINES.map((str, i) => ({
      str,
      x: 10,
      y: 800 - i * 12,
      width: 300,
      page: 1,
    }));
    const { onImport } = render_(vi.fn().mockResolvedValue(items));

    fireEvent.click(screen.getByRole("radio", { name: "Nubank" }));
    const input = screen.getByLabelText("Escolher PDF") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new Blob(["%PDF"], { type: "application/pdf" })],
      configurable: true,
    });
    fireEvent.change(input);
    await screen.findByRole("list", { name: "Lançamentos encontrados" });
    fireEvent.click(screen.getByRole("button", { name: /^Importar \d/ }));

    await waitFor(() => expect(onImport).toHaveBeenCalled());
    const plan = onImport.mock.calls[0]?.[0] as {
      transactions: { draft: { paymentMethodId: string } }[];
    };
    expect(plan.transactions.length).toBeGreaterThan(0);
    expect(plan.transactions.every((t) => t.draft.paymentMethodId === "CARTAO-1")).toBe(true);
  });
});
