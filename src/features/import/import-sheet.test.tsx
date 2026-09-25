import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextItem } from "../../domain/import/lines";
import { parseStatement } from "../../domain/import/parse";
import { identify } from "../../domain/import/plan";
import { type AppState, EMPTY_APP_STATE } from "../../domain/model/app-state";
import type { Category } from "../../domain/model/category";
import type { PaymentMethod } from "../../domain/model/payment-method";
import { ALIVE } from "../../domain/model/row.fake";
import type { Transaction } from "../../domain/model/transaction";
import { ImportSheet } from "./import-sheet";
import { PdfPasswordError, type ReadPdf } from "./read-pdf";

afterEach(cleanup);

const CARD: PaymentMethod = {
  ...ALIVE,
  id: "CARTAO-1",
  name: "Nubank",
  icon: "credit-card",
  color: "violet",
  kind: "credit",
};

const FOOD: Category = {
  ...ALIVE,
  id: "ALIM",
  name: "Alimentação",
  icon: "fork-knife",
  color: "amber",
  kind: "expense",
};

const PAST: Transaction = {
  ...ALIVE,
  id: "T-OLD",
  kind: "expense",
  description: "IFOOD *OUTRO",
  amountMinor: 1000,
  currency: "BRL",
  categoryId: "ALIM",
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-08-01",
  userId: null,
  recurrenceId: null,
  occurrenceKey: null,
};

const LINES = [
  "Vencimento 10/10/2026",
  "12/09 IFOOD *RESTAURANTE 45,90",
  "15/07 LOJA X 03/10 150,00",
  "05/09 PAGAMENTO RECEBIDO -2.300,00",
];

/** Uma linha de texto por `y`, como o pdf.js entregaria. */
function itemsOf(lines: string[]): TextItem[] {
  return lines.map((str, i) => ({ str, x: 10, y: 800 - i * 12, width: 300, page: 1 }));
}

function stateWith(extra: Partial<AppState> = {}): AppState {
  return {
    ...EMPTY_APP_STATE,
    paymentMethods: { [CARD.id]: CARD },
    categories: { [FOOD.id]: FOOD },
    transactions: { [PAST.id]: PAST },
    ...extra,
  };
}

function pickFile() {
  const input = screen.getByLabelText("Escolher PDF") as HTMLInputElement;
  const file = new Blob(["%PDF"], { type: "application/pdf" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

function renderSheet(readPdf: ReadPdf, state = stateWith()) {
  const onImport = vi.fn().mockResolvedValue({ transactions: 3, series: 1 });
  const onClose = vi.fn();
  render(
    <ImportSheet
      state={state}
      today="2026-10-01"
      readPdf={readPdf}
      onImport={onImport}
      onClose={onClose}
    />,
  );
  return { onImport, onClose };
}

describe("ImportSheet", () => {
  it("sem cartão cadastrado, explica e não deixa escolher o PDF", () => {
    renderSheet(vi.fn(), { ...EMPTY_APP_STATE });
    expect(screen.getByText(/cadastre um cartão/i)).toBeDefined();
    expect((screen.getByLabelText("Escolher PDF") as HTMLInputElement).disabled).toBe(true);
  });

  it("lê, sugere categoria, desmarca o pagamento e importa só o marcado", async () => {
    const { onImport } = renderSheet(() => Promise.resolve(itemsOf(LINES)));
    pickFile();

    await screen.findByRole("list", { name: "Lançamentos encontrados" });
    expect((screen.getByLabelText("Mês da fatura (vencimento)") as HTMLInputElement).value).toBe(
      "2026-10",
    );
    expect(
      (screen.getByLabelText("Categoria de IFOOD *RESTAURANTE") as HTMLSelectElement).value,
    ).toBe("ALIM");
    expect((screen.getByLabelText("Importar PAGAMENTO RECEBIDO") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(screen.getByText("3/10")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Importar 2" }));

    await screen.findByText("3 lançamentos importados");
    const plan = onImport.mock.calls[0]?.[0];
    expect(plan.transactions).toHaveLength(1);
    expect(plan.transactions[0].draft).toMatchObject({
      description: "IFOOD *RESTAURANTE",
      categoryId: "ALIM",
      paymentMethodId: "CARTAO-1",
    });
    expect(plan.series).toHaveLength(1);
  });

  it("pede a senha de PDF protegido e tenta de novo com ela", async () => {
    const readPdf = vi
      .fn<ReadPdf>()
      .mockRejectedValueOnce(new PdfPasswordError(false))
      .mockResolvedValueOnce(itemsOf(LINES));
    renderSheet(readPdf);
    pickFile();

    fireEvent.input(await screen.findByLabelText("Senha do PDF"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));

    await screen.findByRole("list", { name: "Lançamentos encontrados" });
    expect(readPdf.mock.calls[1]?.[1]).toBe("123");
  });

  it("linha já importada vem travada e desmarcada", async () => {
    const entries = parseStatement(LINES, "card", "2026-10");
    const [firstId] = identify(entries, { paymentMethodId: CARD.id, referenceMonth: "2026-10" });
    if (firstId === undefined) throw new Error("sem id");
    const state = stateWith({
      transactions: { [PAST.id]: PAST, [firstId]: { ...PAST, id: firstId } },
    });
    renderSheet(() => Promise.resolve(itemsOf(LINES)), state);
    pickFile();

    const box = (await screen.findByLabelText("Importar IFOOD *RESTAURANTE")) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect(screen.getByText("Já importado")).toBeDefined();
  });

  it("PDF sem texto avisa que parece escaneado", async () => {
    renderSheet(() => Promise.resolve([]));
    pickFile();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/escaneado/));
  });
});
