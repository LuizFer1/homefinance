import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALIVE } from "../../domain/model/row.fake";
import { stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { StaleRowsError } from "../session/session";
import { SimilarSheet } from "./similar-sheet";

afterEach(cleanup);

const FOOD = "cat-alimentacao";

const state = {
  ...stateOf({
    transactions: [
      tx("src", "expense", 1_000, "2026-09-01", FOOD, { description: "Mercado Extra" }),
      tx("a", "expense", 2_000, "2026-08-01", null, { description: "MERCADO EXTRA" }),
      tx("b", "expense", 3_000, "2026-08-02", null, { description: "mercado éxtra 0452" }),
      tx("c", "expense", 4_000, "2026-08-03", null, { description: "Cinema" }),
    ],
  }),
  categories: {
    [FOOD]: {
      ...ALIVE,
      id: FOOD,
      name: "Alimentação",
      icon: "tag",
      color: "sky" as const,
      kind: "expense" as const,
    },
  },
};

const query = {
  sourceId: "src",
  description: "Mercado Extra",
  kind: "expense" as const,
  categoryId: FOOD,
};

function open(onApply = vi.fn().mockResolvedValue(2), onClose = vi.fn()) {
  render(<SimilarSheet state={state} query={query} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose };
}

const next = () => fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));

describe("SimilarSheet", () => {
  it("mostra a contagem das semelhantes antes de gravar e não grava ao abrir", () => {
    const { onApply } = open();
    expect(screen.getByText(/Outros 2 lançamentos/)).toBeDefined();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("grava num lote só apenas o que ficou marcado", async () => {
    const { onApply, onClose } = open();
    fireEvent.click(screen.getByRole("checkbox", { name: /Selecionar MERCADO EXTRA/ }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a 1" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(["b"], FOOD);
  });

  it("falha avisa que nada mudou, mantém a seleção e trata StaleRowsError", async () => {
    const onApply = vi.fn().mockRejectedValue(new StaleRowsError());
    const { onClose } = open(onApply);
    next();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a 2" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Nada foi alterado/);
    expect(alert.textContent).toMatch(/outra aba ou na sincronização/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("desmarcar tudo impede de chegar à prévia", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todos" }));
    expect((screen.getByRole("button", { name: /Continuar/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
