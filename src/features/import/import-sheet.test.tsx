import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stableEntityIdV2 } from "../../domain/ids/stable-id";
import type { TextItem } from "../../domain/import/lines";
import { parseStatement } from "../../domain/import/parse";
import { identify, importSeeds, planImport } from "../../domain/import/plan";
import { type AppState, EMPTY_APP_STATE } from "../../domain/model/app-state";
import type { Category } from "../../domain/model/category";
import type { PaymentMethod } from "../../domain/model/payment-method";
import type { Recurrence } from "../../domain/model/recurrence";
import { ALIVE } from "../../domain/model/row.fake";
import type { Transaction } from "../../domain/model/transaction";
import { ImportSheet } from "./import-sheet";
import { PdfPasswordError, PdfReaderUnavailableError, type ReadPdf } from "./read-pdf";

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

/**
 * O que o app de antes gravou ao importar `lines` (todas marcadas): as mesmas
 * linhas, nos ids v1 e sem `importKey`. O lugar v1 casa nos campos, e a revisão
 * reconhece a linha como já importada.
 */
function importedBefore(lines: string[]): Pick<AppState, "transactions" | "recurrences"> {
  const entries = parseStatement(lines, "card", "2026-10").entries.map((entry) => ({
    ...entry,
    selected: true,
    categoryId: null,
  }));
  const plan = planImport(entries, { paymentMethodId: CARD.id, referenceMonth: "2026-10" });
  const transactions: Record<string, Transaction> = { [PAST.id]: PAST };
  for (const { id, draft } of plan.transactions) {
    const { importKey: _novo, ...antigo } = draft;
    transactions[id] = { ...ALIVE, ...antigo, id, userId: null };
  }
  const recurrences: Record<string, Recurrence> = {};
  for (const { id, draft } of plan.series) {
    const { importKey: _novo, ...antigo } = draft;
    recurrences[id] = { ...ALIVE, ...antigo, id };
  }
  return { transactions, recurrences };
}

function pickFile() {
  const input = screen.getByLabelText("Escolher PDF") as HTMLInputElement;
  const file = new Blob(["%PDF"], { type: "application/pdf" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

function renderSheet(readPdf: ReadPdf, state = stateWith()) {
  const onImport = vi.fn().mockResolvedValue({ transactions: 3, series: 1, confirmed: 0 });
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

  it("distingue leitor não baixado de versão velha", async () => {
    // Online, o arquivo sumiu no deploy: pedir internet mandaria a pessoa
    // procurar um problema que ela não tem.
    renderSheet(() => Promise.reject(new PdfReaderUnavailableError(false, null)));
    pickFile();
    expect((await screen.findByRole("alert")).textContent).toContain("versão anterior");

    cleanup();
    renderSheet(() => Promise.reject(new PdfReaderUnavailableError(true, null)));
    pickFile();
    expect((await screen.findByRole("alert")).textContent).toContain("Conecte-se à internet");
  });

  it("linha já importada vem travada e desmarcada", async () => {
    const state = stateWith(importedBefore([LINES[0] ?? "", LINES[1] ?? ""]));
    renderSheet(() => Promise.resolve(itemsOf(LINES)), state);
    pickFile();

    const box = (await screen.findByLabelText("Importar IFOOD *RESTAURANTE")) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect(screen.getByText("Já importado")).toBeDefined();
  });

  it("sugere confirmar a estimativa da mesma categoria e mês, e a linha não vira lançamento", async () => {
    const estimada: Transaction = {
      ...PAST,
      id: "T-EST",
      description: "Delivery do mês",
      occurredOn: "2026-09-10",
      recurrenceId: "SERIE",
      occurrenceKey: "SERIE:2026-09",
      estimated: true,
    };
    const { onImport } = renderSheet(
      () => Promise.resolve(itemsOf(LINES)),
      stateWith({ transactions: { [PAST.id]: PAST, [estimada.id]: estimada } }),
    );
    pickFile();

    const select = (await screen.findByLabelText(
      "Estimativa que IFOOD *RESTAURANTE confirma",
    )) as HTMLSelectElement;
    expect(select.value).toBe("T-EST");
    expect(screen.getByText(/confirma Delivery do mês · set\/2026/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Importar 2" }));

    await waitFor(() => expect(onImport).toHaveBeenCalled());
    const plan = onImport.mock.calls[0]?.[0];
    expect(plan.transactions).toHaveLength(0);
    expect(plan.confirmations).toEqual([
      expect.objectContaining({ transactionId: "T-EST", amountMinor: 4590 }),
    ]);
  });

  it("lugar do id com outro fato: 'Talvez já importado', desmarcada e marcável; marcada vai para v2", async () => {
    const entries = parseStatement(LINES, "card", "2026-10").entries;
    const ctx = { paymentMethodId: CARD.id, referenceMonth: "2026-10" };
    const [firstId] = identify(entries, ctx);
    const [seed] = importSeeds(entries, ctx);
    if (firstId === undefined || seed === undefined) throw new Error("sem id");
    // Uma ocorrência de série que caiu no mesmo lugar v1 da linha do iFood.
    const ocorrencia: Transaction = {
      ...PAST,
      id: firstId,
      recurrenceId: "SERIE",
      occurrenceKey: "SERIE:2026-09",
    };
    const { onImport } = renderSheet(
      () => Promise.resolve(itemsOf(LINES)),
      stateWith({ transactions: { [PAST.id]: PAST, [firstId]: ocorrencia } }),
    );
    pickFile();

    const box = (await screen.findByLabelText("Importar IFOOD *RESTAURANTE")) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
    expect(screen.getByText("Talvez já importado")).toBeDefined();

    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /^Importar/ }));

    await waitFor(() => expect(onImport).toHaveBeenCalled());
    const plan = onImport.mock.calls[0]?.[0];
    const v2 = stableEntityIdV2(seed);
    expect(plan.transactions).toContainEqual(
      expect.objectContaining({ id: v2, draft: expect.objectContaining({ importKey: v2 }) }),
    );
  });

  it("linha que já confirmou uma estimativa conta como importada", async () => {
    const entries = parseStatement(LINES, "card", "2026-10").entries;
    const [firstId] = identify(entries, { paymentMethodId: CARD.id, referenceMonth: "2026-10" });
    const [first] = entries;
    if (first === undefined) throw new Error("sem linha");
    // A confirmação copia valor e data da linha: com a chave v1 (que colide), é o
    // que prova que foi esta linha.
    const conf = {
      ...PAST,
      id: "CONF",
      importKey: firstId,
      kind: first.kind,
      amountMinor: first.amountMinor,
      occurredOn: first.date,
    };
    const state = stateWith({ transactions: { [PAST.id]: PAST, CONF: conf } });
    renderSheet(() => Promise.resolve(itemsOf(LINES)), state);
    pickFile();

    const box = (await screen.findByLabelText("Importar IFOOD *RESTAURANTE")) as HTMLInputElement;
    expect(box.disabled).toBe(true);
  });

  it("resumo final conta importadas, já existentes e não interpretadas com o motivo", async () => {
    const lines = [...LINES, "99/99 LOJA QUEBRADA 10,00", "12/09 SEM VALOR AQUI"];
    const state = stateWith(importedBefore([LINES[0] ?? "", LINES[1] ?? ""]));
    const { onImport } = renderSheet(() => Promise.resolve(itemsOf(lines)), state);
    onImport.mockResolvedValue({ transactions: 1, series: 0, confirmed: 0 });
    pickFile();

    await screen.findByRole("list", { name: "Lançamentos encontrados" });
    fireEvent.click(screen.getByRole("button", { name: /^Importar/ }));

    const summary = await screen.findByLabelText("Resumo da importação");
    expect(summary.textContent).toContain("Importadas1");
    expect(summary.textContent).toContain("Já existiam1");
    expect(summary.textContent).toContain("Não interpretadas2");
    const unread = screen.getByRole("list", { name: "Linhas não interpretadas" });
    expect(unread.textContent).toContain("99/99 LOJA QUEBRADA 10,00");
    expect(unread.textContent).toContain("Data inválida");
    expect(unread.textContent).toContain("12/09 SEM VALOR AQUI");
    expect(unread.textContent).toContain("Sem valor");
  });

  it("reimportar o mesmo arquivo mostra tudo como já existia", async () => {
    const state = stateWith(importedBefore(LINES));
    const { onImport } = renderSheet(() => Promise.resolve(itemsOf(LINES)), state);
    onImport.mockResolvedValue({ transactions: 0, series: 0, confirmed: 0 });
    pickFile();

    await screen.findByRole("list", { name: "Lançamentos encontrados" });
    fireEvent.click(screen.getByRole("button", { name: "Ver resumo" }));

    const summary = await screen.findByLabelText("Resumo da importação");
    expect(summary.textContent).toContain("Importadas0");
    expect(summary.textContent).toContain("Já existiam3");
    expect(summary.textContent).toContain("Não interpretadas0");
    const plan = onImport.mock.calls[0]?.[0];
    expect(plan.transactions).toHaveLength(0);
    expect(plan.series).toHaveLength(0);
  });

  it("PDF sem texto avisa que parece escaneado", async () => {
    renderSheet(() => Promise.resolve([]));
    pickFile();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/escaneado/));
  });
});
