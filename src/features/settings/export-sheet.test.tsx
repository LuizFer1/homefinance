import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_APP_STATE } from "../../domain/model/app-state";
import { ALIVE } from "../../domain/model/row.fake";
import { ExportSheet } from "./export-sheet";

afterEach(cleanup);

const STATE = {
  ...EMPTY_APP_STATE,
  budgets: { A: { ...ALIVE, id: "A", categoryId: "C", limitMinor: 1 } },
};

function open(onExport: () => Promise<void> = vi.fn(async () => {})) {
  render(<ExportSheet state={STATE} today="2026-10-21" onExport={onExport} onClose={vi.fn()} />);
  return onExport;
}

describe("ExportSheet", () => {
  it("mostra o aviso de privacidade e nao baixa antes de avancar", () => {
    const onExport = open();

    expect(screen.getByText(/quem abrir o arquivo lê tudo/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /baixar arquivo/i })).toBeNull();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("na previa mostra o nome do arquivo e baixa ao confirmar", async () => {
    const onExport = open();

    fireEvent.click(screen.getByRole("button", { name: /entendi, continuar/i }));
    expect(screen.getByText("homefinance-2026-10-21.json")).toBeTruthy();
    expect(screen.getByText("Metas por categoria")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /baixar arquivo/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("mostra o erro quando a exportacao falha", async () => {
    open(() => Promise.reject(new Error("banco fechado")));

    fireEvent.click(screen.getByRole("button", { name: /entendi, continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /baixar arquivo/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/banco fechado/);
  });
});
