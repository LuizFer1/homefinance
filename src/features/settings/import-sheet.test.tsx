import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrepareResult } from "../../data/import";
import type { ImportPlan } from "../../domain/export/import-data";
import { TABLE_NAMES, type TableName } from "../../domain/model/app-state";
import { StaleRowsError } from "../session/session";
import { ImportSheet } from "./import-sheet";

afterEach(cleanup);

function planWith(total: number): ImportPlan {
  const counts = Object.fromEntries(
    TABLE_NAMES.map((t) => [t, { created: 0, updated: 0, deleted: 0, ignored: 0 }]),
  ) as ImportPlan["counts"];
  const table: TableName = "budgets";
  counts[table] = { created: total, updated: 0, deleted: 0, ignored: 2 };
  return {
    counts,
    rows: {},
    expected: {},
    total,
    maxHlc: null,
    unknownTables: [],
    exportedAt: null,
  };
}

const FILE = new File(["{}"], "homefinance-2026-10-21.json", { type: "application/json" });

function open(over: {
  prepare?: (file: File) => Promise<PrepareResult>;
  apply?: (plan: ImportPlan) => Promise<void>;
}) {
  const onPrepare = vi.fn(over.prepare ?? (async () => ({ ok: true as const, plan: planWith(3) })));
  const onApply = vi.fn(over.apply ?? (async () => {}));
  const onClose = vi.fn();
  render(<ImportSheet onPrepare={onPrepare} onApply={onApply} onClose={onClose} />);
  return { onPrepare, onApply, onClose };
}

function choose() {
  fireEvent.change(screen.getByLabelText("Escolher arquivo"), { target: { files: [FILE] } });
}

describe("ImportSheet", () => {
  it("comeca na escolha do arquivo e a previa nao esta alcancavel", () => {
    open({});

    expect(screen.getByText("Escolha o arquivo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^importar/i })).toBeNull();
    expect((screen.getByLabelText("Próxima etapa") as HTMLButtonElement).disabled).toBe(true);
  });

  it("mostra a previa por tabela e so grava ao confirmar, com botao que nomeia a acao", async () => {
    const { onApply } = open({});

    choose();

    expect(await screen.findByText("Prévia da importação")).toBeTruthy();
    expect(screen.getByText("Metas por categoria")).toBeTruthy();
    expect(screen.getByText(/3 novas · 0 atualizadas · 0 apagadas · 2 ignoradas/)).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Importar 3 linhas" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    expect((await screen.findByRole("status")).textContent).toMatch(/3 linhas importadas/);
  });

  it("arquivo invalido mostra a mensagem e fica na escolha", async () => {
    open({ prepare: async () => ({ ok: false, message: "Este arquivo não é um JSON válido." }) });

    choose();

    expect((await screen.findByRole("alert")).textContent).toMatch(/JSON válido/);
    expect(screen.getByText("Escolha o arquivo")).toBeTruthy();
  });

  it("sem nada novo, o botao fica desabilitado e diz isso", async () => {
    open({ prepare: async () => ({ ok: true, plan: planWith(0) }) });

    choose();

    const button = (await screen.findByRole("button", {
      name: /nada para importar/i,
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("StaleRowsError volta para a escolha pedindo o arquivo de novo", async () => {
    open({ apply: () => Promise.reject(new StaleRowsError()) });

    choose();
    fireEvent.click(await screen.findByRole("button", { name: "Importar 3 linhas" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/mudaram em outra aba/);
    expect(screen.getByText("Escolha o arquivo")).toBeTruthy();
  });

  it("mostra tabelas desconhecidas como ignoradas", async () => {
    open({
      prepare: async () => ({ ok: true, plan: { ...planWith(1), unknownTables: ["futuro"] } }),
    });

    choose();

    expect((await screen.findByText(/versão mais nova/)).textContent).toMatch(/futuro/);
  });
});
