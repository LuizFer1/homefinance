import { describe, expect, it } from "vitest";
import { type AppState, EMPTY_APP_STATE, TABLE_NAMES } from "../model/app-state";
import type { Budget } from "../model/budget";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import {
  buildExport,
  EXPORT_APP,
  EXPORT_FORMAT_VERSION,
  exportFileName,
  serializeExport,
} from "./export-data";

const NOW = Date.UTC(2026, 9, 21, 15, 0, 0);

function budget(id: string, extra: Partial<Budget> = {}): Budget {
  return { ...ALIVE, id, categoryId: "CATEGORY", limitMinor: 50_000, dirty: 1, ...extra };
}

function stateWith(rows: Budget[]): AppState {
  return {
    ...EMPTY_APP_STATE,
    budgets: Object.fromEntries(rows.map((row) => [row.id, row])),
  };
}

describe("buildExport", () => {
  it("traz o cabecalho do formato e todas as tabelas, mesmo vazias", () => {
    const file = buildExport(EMPTY_APP_STATE, NOW);

    expect(file.app).toBe(EXPORT_APP);
    expect(file.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(file.exportedAt).toBe("2026-10-21T15:00:00.000Z");
    // Uma tabela nova em TABLE_NAMES sem exportacao faz este teste falhar.
    expect(Object.keys(file.tables).sort()).toEqual([...TABLE_NAMES].sort());
    for (const table of TABLE_NAMES) expect(file.tables[table]).toEqual([]);
  });

  it("inclui as lapides", () => {
    const state = stateWith([
      budget("A", { deletedAt: DELETED_AT, updatedAt: DELETED_AT }),
      budget("B"),
    ]);

    const rows = buildExport(state, NOW).tables.budgets;

    expect(rows.map((row) => row.id)).toEqual(["A", "B"]);
    expect(rows[0]?.deletedAt).toBe(DELETED_AT);
  });

  it("tira o dirty e preserva o resto da linha", () => {
    const [row] = buildExport(stateWith([budget("A")]), NOW).tables.budgets;

    expect(row).toBeDefined();
    expect("dirty" in (row ?? {})).toBe(false);
    expect(row).toMatchObject({ id: "A", categoryId: "CATEGORY", limitMinor: 50_000 });
    expect(row?.updatedAt).toBe(ALIVE.updatedAt);
  });

  it("nao exporta meta nem qualquer chave fora das tabelas de entidade", () => {
    const file = buildExport(EMPTY_APP_STATE, NOW);

    expect(Object.keys(file).sort()).toEqual(["app", "exportedAt", "formatVersion", "tables"]);
    expect("meta" in file.tables).toBe(false);
  });

  it("e deterministico: mesma entrada, mesmo texto, qualquer que seja a ordem das linhas", () => {
    const a = stateWith([budget("B"), budget("A"), budget("C")]);
    const b = stateWith([budget("C"), budget("A"), budget("B")]);

    expect(serializeExport(buildExport(a, NOW))).toBe(serializeExport(buildExport(b, NOW)));
    expect(buildExport(a, NOW).tables.budgets.map((row) => row.id)).toEqual(["A", "B", "C"]);
  });

  it("nao muda o estado recebido", () => {
    const state = stateWith([budget("A")]);
    buildExport(state, NOW);

    expect(state.budgets.A?.dirty).toBe(1);
  });
});

describe("exportFileName", () => {
  it("usa a data local no nome", () => {
    expect(exportFileName("2026-10-21")).toBe("homefinance-2026-10-21.json");
  });
});
