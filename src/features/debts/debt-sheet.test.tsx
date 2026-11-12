import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Debt } from "../../domain/model/debt";
import { ALIVE } from "../../domain/model/row.fake";
import { HOLD_MS } from "../ui/hold-button";
import { DebtSheet, type DebtSheetProps } from "./debt-sheet";

afterEach(cleanup);

const TODAY = "2026-11-11";

function renderSheet(props: Partial<DebtSheetProps> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <DebtSheet editing={null} today={TODAY} onSubmit={onSubmit} onClose={onClose} {...props} />,
  );
  return { onSubmit, onClose };
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
const field = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
const stepNow = () => screen.getByRole("button", { current: "step" }).getAttribute("aria-label");

const EXISTING: Debt = {
  ...ALIVE,
  id: "D1",
  name: "Financiamento do forno",
  creditor: "Banco do Povo",
  principalMinor: 900_000,
  balanceMinor: 700_000,
  dueOn: "2026-12-10",
  book: "business",
};

/** Preenche as duas primeiras etapas e para na do vencimento. */
function fillUntilDue(name = "Empréstimo", principal = "100000", balance = "60000") {
  field("Nome da dívida", name);
  next();
  field("Valor original", principal);
  field("Saldo atual", balance);
  next();
}

describe("DebtSheet", () => {
  it("tem quatro etapas: dívida, valores, vencimento e prévia", () => {
    renderSheet();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    for (const label of ["Dívida", "Valores", "Vencimento", "Prévia"]) {
      expect(screen.getByRole("button", { name: label })).toBeDefined();
    }
    expect(stepNow()).toBe("Dívida");
  });

  it("sem nome não avança", () => {
    renderSheet();
    next();
    expect(screen.getByRole("alert").textContent).toBe("Informe o nome da dívida.");
    expect(stepNow()).toBe("Dívida");
  });

  it("os valores só aceitam dígitos e exigem original e saldo", () => {
    renderSheet();
    field("Nome da dívida", "Empréstimo");
    next();

    field("Valor original", "R$ 1a0b0,00");
    expect((screen.getByLabelText("Valor original") as HTMLInputElement).value).toBe("100,00");
    field("Valor original", "");
    next();
    expect(screen.getByRole("alert").textContent).toBe("Informe o valor original da dívida.");
    expect(stepNow()).toBe("Valores");
  });

  it("o saldo começa igual ao valor original e para de acompanhar quando é editado", () => {
    renderSheet();
    field("Nome da dívida", "Empréstimo");
    next();
    field("Valor original", "100000");
    expect((screen.getByLabelText("Saldo atual") as HTMLInputElement).value).toBe("1.000,00");

    field("Saldo atual", "60000");
    field("Valor original", "200000");
    expect((screen.getByLabelText("Saldo atual") as HTMLInputElement).value).toBe("600,00");
  });

  it("saldo maior que o original dá erro claro ao digitar e barra o avanço", () => {
    renderSheet();
    field("Nome da dívida", "Empréstimo");
    next();
    field("Valor original", "100000");
    field("Saldo atual", "100001");

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toBe(
      "O saldo atual não pode ser maior que o valor original.",
    );
    expect(screen.getByLabelText("Saldo atual").getAttribute("aria-invalid")).toBe("true");

    next();
    expect(stepNow()).toBe("Valores");
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    field("Saldo atual", "100000");
    expect(screen.queryByRole("alert")).toBeNull();
    next();
    expect(stepNow()).toBe("Vencimento");
  });

  it("saldo vazio depois de editado é zero: dívida quitada", async () => {
    const { onSubmit } = renderSheet();
    fillUntilDue("Empréstimo", "100000", "");
    expect(stepNow()).toBe("Vencimento");
    next();
    fireEvent.click(screen.getByRole("button", { name: "Salvar dívida" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ balanceMinor: 0 }));
  });

  it("o vencimento é opcional: sem ligar, não há calendário e a prévia não cita data", () => {
    renderSheet();
    fillUntilDue();
    expect(screen.queryByRole("button", { name: "Vencimento", expanded: false })).toBeNull();
    next();

    expect(stepNow()).toBe("Prévia");
    expect(screen.getByText("Empréstimo")).toBeDefined();
    expect(screen.queryByText(/vence/)).toBeNull();
    expect(screen.getByRole("button", { name: "Salvar dívida" })).toBeDefined();
  });

  it("salvar entrega os centavos, o credor aparado e o vencimento escolhido", async () => {
    const { onSubmit, onClose } = renderSheet();
    field("Nome da dívida", "  Empréstimo ");
    field("Credor (opcional)", "  Banco ");
    next();
    field("Valor original", "100000");
    field("Saldo atual", "60000");
    next();
    fireEvent.click(screen.getByRole("checkbox", { name: /tem data de vencimento/i }));
    next();
    expect(screen.getByText(/Saldo de .*600,00 sobre .*1\.000,00 originais/)).toBeDefined();
    expect(screen.getByText(/Banco · vence/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Salvar dívida" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Empréstimo",
      creditor: "Banco",
      principalMinor: 100_000,
      balanceMinor: 60_000,
      dueOn: TODAY,
    });
  });

  it("sem credor e sem vencimento entrega null nos dois", async () => {
    const { onSubmit } = renderSheet();
    fillUntilDue();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Salvar dívida" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Empréstimo",
      creditor: null,
      principalMinor: 100_000,
      balanceMinor: 60_000,
      dueOn: null,
    });
  });

  it("se a gravação falhar o sheet continua aberto com o motivo", async () => {
    const { onClose } = renderSheet({
      onSubmit: vi.fn().mockRejectedValue(new Error("disco cheio")),
    });
    fillUntilDue();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Salvar dívida" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Não foi salvo. disco cheio"),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("editar abre com os dados, mesmo sheet, e atualiza só o saldo", async () => {
    const { onSubmit, onClose } = renderSheet({ editing: EXISTING });
    expect(screen.getByRole("heading", { name: "Editar dívida" })).toBeDefined();
    expect((screen.getByLabelText("Nome da dívida") as HTMLInputElement).value).toBe(
      "Financiamento do forno",
    );
    expect((screen.getByLabelText("Credor (opcional)") as HTMLInputElement).value).toBe(
      "Banco do Povo",
    );
    next();
    field("Saldo atual", "650000");
    next();
    expect(screen.getByRole("checkbox", { name: /tem data de vencimento/i })).toHaveProperty(
      "checked",
      true,
    );
    next();
    fireEvent.click(screen.getByRole("button", { name: "Salvar dívida" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Financiamento do forno",
      creditor: "Banco do Povo",
      principalMinor: 900_000,
      balanceMinor: 650_000,
      dueOn: "2026-12-10",
    });
  });

  it("só a edição tem a lixeira, e ela exige segurar", async () => {
    renderSheet();
    expect(screen.queryByRole("button", { name: /excluir dívida/i })).toBeNull();
    cleanup();

    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderSheet({ editing: EXISTING, onDelete });
    fireEvent.click(screen.getByRole("button", { name: /excluir dívida/i }));
    expect(onDelete).not.toHaveBeenCalled();

    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByRole("button", { name: /excluir dívida/i }));
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    vi.useRealTimers();
    expect(onDelete).toHaveBeenCalledOnce();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
