import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "../../domain/model/asset";
import { ALIVE } from "../../domain/model/row.fake";
import { HOLD_MS } from "../ui/hold-button";
import { AssetSheet, type AssetSheetProps } from "./asset-sheet";

afterEach(cleanup);

const TODAY = "2026-11-11";

function renderSheet(props: Partial<AssetSheetProps> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <AssetSheet editing={null} today={TODAY} onSubmit={onSubmit} onClose={onClose} {...props} />,
  );
  return { onSubmit, onClose };
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
const typeName = (value: string) =>
  fireEvent.input(screen.getByLabelText("Nome do bem"), { target: { value } });
const typeValue = (value: string) =>
  fireEvent.input(screen.getByLabelText("Valor atual"), { target: { value } });
const stepNow = () => screen.getByRole("button", { current: "step" }).getAttribute("aria-label");

const EXISTING: Asset = {
  ...ALIVE,
  id: "A1",
  kind: "equipment",
  name: "Forno",
  valueMinor: 450_000,
  acquiredOn: "2026-08-01",
  book: "business",
};

describe("AssetSheet", () => {
  it("tem quatro etapas: nome, tipo e valor, data e prévia", () => {
    renderSheet();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    for (const label of ["Nome", "Tipo e valor", "Data", "Prévia"]) {
      expect(screen.getByRole("button", { name: label })).toBeDefined();
    }
    expect(stepNow()).toBe("Nome");
  });

  it("sem nome não avança, e não deixa pular para as etapas seguintes", () => {
    renderSheet();
    next();
    expect(screen.getByRole("alert").textContent).toBe("Informe o nome do bem.");
    expect(stepNow()).toBe("Nome");
    expect((screen.getByRole("button", { name: "Prévia" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("sem valor a etapa de tipo e valor também barra", () => {
    renderSheet();
    typeName("Forno");
    next();
    expect(stepNow()).toBe("Tipo e valor");

    next();
    expect(screen.getByRole("alert").textContent).toBe("Informe o valor do bem.");
    expect(stepNow()).toBe("Tipo e valor");
  });

  it("Enter no campo de nome avança", () => {
    renderSheet();
    typeName("Forno");
    fireEvent.submit(screen.getByLabelText("Nome do bem").closest("form") as HTMLFormElement);
    expect(stepNow()).toBe("Tipo e valor");
  });

  it("o tipo é um segmentado de três opções e o valor só aceita dígitos", () => {
    renderSheet();
    typeName("Forno");
    next();

    for (const label of ["Investimento", "Estoque", "Equipamento"]) {
      expect(screen.getByRole("radio", { name: label })).toBeDefined();
    }
    typeValue("R$ 4a5b0,00");
    expect((screen.getByLabelText("Valor atual") as HTMLInputElement).value).toBe("450,00");
  });

  it("a prévia mostra o que será salvo e só ali o botão se chama Salvar bem", () => {
    renderSheet();
    typeName("  Forno industrial ");
    next();
    fireEvent.click(screen.getByRole("radio", { name: "Equipamento" }));
    typeValue("450000");
    next();
    expect(stepNow()).toBe("Data");
    expect(screen.queryByRole("button", { name: "Salvar bem" })).toBeNull();
    next();

    expect(stepNow()).toBe("Prévia");
    expect(screen.getByText("Forno industrial")).toBeDefined();
    expect(screen.getByText(/Equipamento · Hoje/)).toBeDefined();
    expect(screen.getByText(/4\.500,00/)).toBeDefined();
    expect(screen.getByText(/Não muda receitas, despesas nem o resultado do mês/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Salvar bem" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  });

  it("salvar entrega nome aparado, tipo, centavos e a data e fecha", async () => {
    const { onSubmit, onClose } = renderSheet();
    typeName("  Farinha ");
    next();
    fireEvent.click(screen.getByRole("radio", { name: "Estoque" }));
    typeValue("90000");
    next();
    fireEvent.click(screen.getByRole("button", { name: "Ontem" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Salvar bem" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "inventory",
      name: "Farinha",
      valueMinor: 90_000,
      acquiredOn: "2026-11-10",
    });
  });

  it("se a gravação falhar o sheet continua aberto com o motivo e as escolhas", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("disco cheio"));
    const { onClose } = renderSheet({ onSubmit });
    typeName("Forno");
    next();
    typeValue("1000");
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Salvar bem" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Não foi salvo. disco cheio"),
    );
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Nome" }));
    expect((screen.getByLabelText("Nome do bem") as HTMLInputElement).value).toBe("Forno");
  });

  it("editar abre com os dados do bem, mesmo sheet, e salva as mudanças", async () => {
    const { onSubmit, onClose } = renderSheet({ editing: EXISTING });
    expect(screen.getByRole("heading", { name: "Editar bem" })).toBeDefined();
    expect((screen.getByLabelText("Nome do bem") as HTMLInputElement).value).toBe("Forno");

    typeName("Forno a gás");
    next();
    expect((screen.getByRole("radio", { name: "Equipamento" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText("Valor atual") as HTMLInputElement).value).toBe("4.500,00");
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Salvar bem" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "equipment",
      name: "Forno a gás",
      valueMinor: 450_000,
      acquiredOn: "2026-08-01",
    });
  });

  it("tipo desconhecido (versão futura) abre sem derrubar e cai no primeiro tipo", () => {
    renderSheet({ editing: { ...EXISTING, kind: "vehicle" as never } });
    next();
    expect((screen.getByRole("radio", { name: "Investimento" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("só a edição tem a lixeira, e ela exige segurar", async () => {
    renderSheet();
    expect(screen.queryByRole("button", { name: /excluir bem/i })).toBeNull();
    cleanup();

    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderSheet({ editing: EXISTING, onDelete });
    fireEvent.click(screen.getByRole("button", { name: /excluir bem/i }));
    expect(onDelete).not.toHaveBeenCalled();

    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByRole("button", { name: /excluir bem/i }));
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    vi.useRealTimers();
    expect(onDelete).toHaveBeenCalledOnce();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
