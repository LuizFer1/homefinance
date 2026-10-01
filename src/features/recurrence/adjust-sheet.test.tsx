import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stableEntityId } from "../../domain/ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../../domain/model/app-state";
import type { Recurrence } from "../../domain/model/recurrence";
import type { RecurrenceAdjustment } from "../../domain/model/recurrence-adjustment";
import { ALIVE } from "../../domain/model/row.fake";
import type { Transaction } from "../../domain/model/transaction";
import { formatBRL } from "../../domain/money/money";
import { adjustmentId } from "../../domain/recurrence/adjustments";
import { occurrenceKey } from "../../domain/recurrence/schedule";
import { HOLD_MS } from "../ui/hold-button";
import { AdjustSheet } from "./adjust-sheet";

afterEach(cleanup);

// `Intl` separa "R$" do número com espaço inseparável; o texto do DOM chega
// normalizado pelo Testing Library, a string do matcher não.
function brl(minor: number): string {
  return formatBRL(minor).replace(/\s/g, " ");
}

const SALARIO: Recurrence = {
  ...ALIVE,
  id: "SERIE-1",
  kind: "income",
  description: "Salário",
  amountMinor: 300_000,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  frequency: "monthly",
  scheduleType: "dayOfMonth",
  scheduleN: 5,
  startOn: "2026-06-05",
  endOn: null,
  active: true,
};

function ocorrencia(period: string, amountMinor = 300_000): Transaction {
  const key = occurrenceKey(SALARIO.id, period);
  return {
    ...ALIVE,
    id: stableEntityId(key),
    kind: "income",
    description: "Salário",
    amountMinor,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: `${period}-05`,
    userId: null,
    recurrenceId: SALARIO.id,
    occurrenceKey: key,
  };
}

function estado(transactions: Transaction[], adjustments: RecurrenceAdjustment[] = []): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: { [SALARIO.id]: SALARIO },
    transactions: Object.fromEntries(transactions.map((t) => [t.id, t])),
    recurrenceAdjustments: Object.fromEntries(adjustments.map((a) => [a.id, a])),
  };
}

const LANCADAS = [ocorrencia("2026-06"), ocorrencia("2026-07"), ocorrencia("2026-08")];

function montar(state: AppState) {
  const onConfirm = vi.fn();
  const onRemove = vi.fn();
  const onClose = vi.fn();
  render(
    <AdjustSheet
      state={state}
      recurrenceId={SALARIO.id}
      today="2026-08-10"
      onConfirm={onConfirm}
      onRemove={onRemove}
      onClose={onClose}
    />,
  );
  return { onConfirm, onRemove, onClose };
}

describe("AdjustSheet", () => {
  it("abre na próxima competência sem lançamento e mostra o valor vigente", () => {
    montar(estado(LANCADAS));

    expect((screen.getByRole("radio", { name: "set/2026" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByText(brl(300_000))).toBeTruthy();
  });

  it("valor novo mostra o percentual e confirma em centavos", () => {
    const { onConfirm } = montar(estado(LANCADAS));

    fireEvent.input(screen.getByLabelText("Valor novo"), { target: { value: "3500,00" } });
    expect(screen.getByText("(+16,67%)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar reajuste" }));
    expect(onConfirm).toHaveBeenCalledWith({
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-09",
      amountMinor: 350_000,
    });
  });

  it("percentual calcula o valor novo", () => {
    const { onConfirm } = montar(estado(LANCADAS));

    fireEvent.click(screen.getByRole("radio", { name: "Percentual" }));
    fireEvent.input(screen.getByLabelText("Percentual (%)"), { target: { value: "12" } });
    expect(screen.getByText(brl(336_000))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar reajuste" }));
    expect(onConfirm).toHaveBeenCalledWith({
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-09",
      amountMinor: 336_000,
    });
  });

  it("retroativo resume o que atualiza e o que mantém", () => {
    montar(estado([ocorrencia("2026-06"), ocorrencia("2026-07"), ocorrencia("2026-08", 310_000)]));

    fireEvent.click(screen.getByRole("radio", { name: "jul/2026" }));
    fireEvent.input(screen.getByLabelText("Valor novo"), { target: { value: "3500,00" } });

    expect(screen.getByText("Atualiza 1 lançamento já feito")).toBeTruthy();
    expect(screen.getByText("Mantém 1 editado à mão")).toBeTruthy();
  });

  it("valor igual ao vigente não confirma", () => {
    montar(estado(LANCADAS));

    fireEvent.input(screen.getByLabelText("Valor novo"), { target: { value: "3000,00" } });

    const confirmar = screen.getByRole("button", { name: "Confirmar reajuste" });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
  });

  it("histórico remove o reajuste segurando a lixeira", () => {
    vi.useFakeTimers();
    const reajuste: RecurrenceAdjustment = {
      ...ALIVE,
      id: adjustmentId(SALARIO.id, "2026-09"),
      recurrenceId: SALARIO.id,
      fromPeriod: "2026-09",
      amountMinor: 350_000,
    };
    const { onRemove } = montar(estado(LANCADAS, [reajuste]));

    const lixeira = screen.getByRole("button", {
      name: "Excluir reajuste de set/2026 (segure para confirmar)",
    });
    fireEvent.pointerDown(lixeira);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });

    expect(onRemove).toHaveBeenCalledWith(reajuste.id);
    vi.useRealTimers();
  });
});
