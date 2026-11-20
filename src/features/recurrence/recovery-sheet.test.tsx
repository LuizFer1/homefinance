import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Recurrence } from "../../domain/model/recurrence";
import { ALIVE } from "../../domain/model/row.fake";
import type { LostOccurrence } from "../../domain/recurrence/plan";
import { RecoverySheet, recoveryLabel } from "./recovery-sheet";

afterEach(cleanup);

function serie(id: string, description: string): Recurrence {
  return {
    ...ALIVE,
    id,
    kind: "income",
    description,
    amountMinor: 500_000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    frequency: "monthly",
    scheduleType: "dayOfMonth",
    scheduleN: 5,
    startOn: "2026-01-05",
    endOn: null,
    active: true,
  };
}

function perdida(series: Recurrence, period: string, amountMinor: number): LostOccurrence {
  const key = `${series.id}:${period}`;
  return {
    entityId: `V2-${key}`,
    series,
    period,
    anchored: false,
    book: "personal",
    userId: null,
    draft: {
      kind: series.kind,
      description: series.description,
      amountMinor,
      currency: "BRL",
      categoryId: null,
      paymentMethodId: null,
      cashbackMinor: null,
      occurredOn: `${period}-05`,
      recurrenceId: series.id,
      occurrenceKey: key,
    },
  };
}

const SALARIO = serie("S1", "Salário");
const ALUGUEL = { ...serie("S2", "Aluguel"), kind: "expense" as const };
const LOST = [
  perdida(SALARIO, "2026-03", 500_000),
  perdida(SALARIO, "2026-07", 550_000),
  perdida(ALUGUEL, "2026-05", 180_000),
];

function renderSheet(onApply = vi.fn().mockResolvedValue(undefined), lost = LOST) {
  const onClose = vi.fn();
  render(<RecoverySheet lost={lost} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose };
}

/** A chave que o reparo de duplicatas e a exclusão da v1 deixaram sem linha viva. */
function doReparo(series: Recurrence, period: string): LostOccurrence {
  const item = perdida(series, period, 500_000);
  const row = { ...ALIVE, ...item.draft, id: item.entityId, userId: null };
  return { ...item, merged: { tombstone: row, keeper: { ...row, id: "V1" } } };
}

describe("recoveryLabel", () => {
  it("nomeia a ação, inclusive com nada marcado", () => {
    expect(recoveryLabel(1, 0)).toBe("Recriar 1 lançamento");
    expect(recoveryLabel(3, 2)).toBe("Recriar 3 lançamentos");
    expect(recoveryLabel(0, 2)).toBe("Não recriar 2 lançamentos");
  });
});

describe("RecoverySheet", () => {
  it("lista por série, com tudo marcado, em etapas com progresso e setas", () => {
    renderSheet();
    expect(screen.getByText("Salário")).toBeDefined();
    expect(screen.getByText("Aluguel")).toBeDefined();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(3);
    expect(boxes.every((box) => box.checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Próxima etapa" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Etapa anterior" })).toBeDefined();
    // Só a prévia grava.
    expect(screen.queryByRole("button", { name: /^Recriar/ })).toBeNull();
  });

  it("prévia mostra as duas escolhas; o botão grava recriadas e não recriadas num lote", async () => {
    const { onApply, onClose } = renderSheet();
    fireEvent.click(screen.getByLabelText("Recriar Aluguel de 05 mai/2026"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByRole("list", { name: "Recriar (2)" })).toBeDefined();
    expect(screen.getByRole("list", { name: "Não recriar (1)" }).textContent).toContain("Aluguel");
    fireEvent.click(screen.getByRole("button", { name: "Recriar 2 lançamentos" }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const [recreate, dismiss] = onApply.mock.calls[0] ?? [];
    expect(recreate.map((item: LostOccurrence) => item.period)).toEqual(["2026-03", "2026-07"]);
    expect(dismiss.map((item: LostOccurrence) => item.period)).toEqual(["2026-05"]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("nada marcado: o botão é 'Não recriar' e grava só os tombstones", async () => {
    const { onApply } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todos" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Não recriar 3 lançamentos" }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const [recreate, dismiss] = onApply.mock.calls[0] ?? [];
    expect(recreate).toEqual([]);
    expect(dismiss).toHaveLength(3);
  });

  it("falha ao gravar mantém o sheet aberto com o motivo", async () => {
    const { onClose } = renderSheet(vi.fn().mockRejectedValue(new Error("quota")));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Recriar 3 lançamentos" }));

    expect((await screen.findByRole("alert")).textContent).toContain("quota");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("apagada junto com a duplicata: aparte, com o próprio aviso, e desmarcada", async () => {
    const reparada = doReparo(SALARIO, "2026-06");
    const { onApply } = renderSheet(undefined, [...LOST, reparada]);

    expect(screen.getByText(/apagados em outro aparelho/)).toBeDefined();
    const box = screen.getByLabelText("Recriar Salário de 05 jun/2026") as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Recriar 3 lançamentos" }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const [recreate, dismiss] = onApply.mock.calls[0] ?? [];
    expect(recreate).toHaveLength(3);
    expect(dismiss).toEqual([reparada]);
  });

  it("fechar sem confirmar não grava nada", () => {
    const { onApply, onClose } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
