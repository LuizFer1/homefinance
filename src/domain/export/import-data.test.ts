import { describe, expect, it } from "vitest";
import { formatHlc } from "../clock/hlc";
import { EMPTY_APP_STATE } from "../model/app-state";
import type { BaseRow } from "../model/base";
import { buildExport, EXPORT_FORMAT_VERSION, serializeExport } from "./export-data";
import {
  type ImportedRow,
  idsByTable,
  type LocalRows,
  MAX_IMPORT_BYTES,
  type ParsedImport,
  parseImport,
  planImport,
} from "./import-data";

const DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";
const hlc = (millis: number, counter = 0) => formatHlc({ millis, counter, deviceId: DEVICE });
const id = (n: number) => `01J9F3K2M7QX8YB4TVWZ0DC${String(n).padStart(3, "0")}`;

function fileRow(n: number, millis: number, extra: Record<string, unknown> = {}): ImportedRow {
  return {
    id: id(n),
    createdAt: "2026-08-07T12:00:00.000Z",
    updatedAt: hlc(millis),
    deletedAt: null,
    categoryId: "C",
    limitMinor: 100,
    ...extra,
  };
}

function localRow(n: number, millis: number, deletedAt: string | null = null): BaseRow {
  return { ...fileRow(n, millis), deletedAt, dirty: 0 } as unknown as BaseRow;
}

function parsed(budgets: ImportedRow[], unknownTables: string[] = []): ParsedImport {
  return { formatVersion: 1, exportedAt: null, tables: { budgets }, unknownTables };
}

function envelope(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: "homefinance",
    formatVersion: 1,
    exportedAt: "2026-10-21T15:00:00.000Z",
    tables: { budgets: [fileRow(1, 1000)] },
    ...over,
  });
}

function message(text: string): string {
  const result = parseImport(text);
  if (result.ok) throw new Error("devia rejeitar");
  return result.message;
}

describe("parseImport", () => {
  it("aceita o que buildExport gera, tabelas vazias inclusive", () => {
    const state = { ...EMPTY_APP_STATE, budgets: { [id(1)]: localRow(1, 1000) } };
    const result = parseImport(serializeExport(buildExport(state as never, 0)));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.tables.budgets).toHaveLength(1);
      expect(result.file.tables.users).toEqual([]);
      expect(result.file.unknownTables).toEqual([]);
    }
  });

  it("rejeita JSON quebrado, app errado e estrutura errada", () => {
    expect(message("{nao e json")).toMatch(/JSON válido/);
    expect(message("[]")).toMatch(/não foi gerado pelo HomeFinance/);
    expect(message(envelope({ app: "outro" }))).toMatch(/não foi gerado pelo HomeFinance/);
    expect(message(envelope({ tables: [] }))).toMatch(/tabelas/);
    expect(message(envelope({ tables: { budgets: {} } }))).toMatch(/budgets.*lista/);
    expect(message(envelope({ formatVersion: "1" }))).toMatch(/versão de formato/);
    expect(message(envelope({ formatVersion: 0 }))).toMatch(/versão de formato/);
  });

  it("versao maior pede para atualizar o app", () => {
    expect(message(envelope({ formatVersion: EXPORT_FORMAT_VERSION + 1 }))).toMatch(
      /Atualize o app/,
    );
  });

  it("rejeita o arquivo inteiro com id ou HLC invalido, mesmo se o resto for bom", () => {
    const good = fileRow(1, 1000);
    const bad = (patch: Record<string, unknown>) =>
      envelope({ tables: { budgets: [good, { ...fileRow(2, 1000), ...patch }] } });

    expect(message(bad({ id: "curto" }))).toMatch(/Linha 2.*id malformado/);
    expect(message(bad({ id: "01J9F3K2M7QX8YB4TVWZ0DCEIL" }))).toMatch(/id malformado/);
    expect(message(bad({ updatedAt: "ontem" }))).toMatch(/updatedAt malformado/);
    expect(message(bad({ deletedAt: "ontem" }))).toMatch(/deletedAt malformado/);
    expect(message(bad({ createdAt: 5 }))).toMatch(/createdAt/);
    expect(message(envelope({ tables: { budgets: [null] } }))).toMatch(/não é um objeto/);
  });

  it("tabela desconhecida degrada: e ignorada e contada", () => {
    const result = parseImport(envelope({ tables: { budgets: [], futuro: [{ x: 1 }] } }));

    expect(result.ok && result.file.unknownTables).toEqual(["futuro"]);
  });

  it("campo desconhecido na linha e preservado como veio", () => {
    const result = parseImport(
      envelope({ tables: { budgets: [fileRow(1, 1000, { novoCampo: { a: [1] } })] } }),
    );

    expect(result.ok && result.file.tables.budgets?.[0]?.novoCampo).toEqual({ a: [1] });
  });

  it("recusa texto acima do limite", () => {
    expect(message("x".repeat(MAX_IMPORT_BYTES + 1))).toMatch(/grande demais/);
  });
});

describe("planImport", () => {
  it("linha ausente entra como nova, dirty 1, e o plano nao apaga nada", () => {
    const plan = planImport(parsed([fileRow(1, 1000)]), {});

    expect(plan.counts.budgets).toEqual({ created: 1, updated: 0, deleted: 0, ignored: 0 });
    expect(plan.rows.budgets?.[0]?.dirty).toBe(1);
    expect(plan.expected.budgets).toEqual({ [id(1)]: null });
    expect(plan.total).toBe(1);
  });

  it("conflito LWW: arquivo mais novo vence, mais velho e igual nao substituem", () => {
    const local: LocalRows = {
      budgets: {
        [id(1)]: localRow(1, 2000),
        [id(2)]: localRow(2, 2000),
        [id(3)]: localRow(3, 2000),
      },
    };
    const plan = planImport(parsed([fileRow(1, 3000), fileRow(2, 1000), fileRow(3, 2000)]), local);

    expect(plan.counts.budgets).toEqual({ created: 0, updated: 1, deleted: 0, ignored: 2 });
    expect(plan.rows.budgets?.map((r) => r.id)).toEqual([id(1)]);
    expect(plan.expected.budgets).toEqual({ [id(1)]: hlc(2000) });
  });

  it("lapide do arquivo mais nova apaga; mais velha nao ressuscita nem apaga", () => {
    const local: LocalRows = {
      budgets: { [id(1)]: localRow(1, 1000), [id(2)]: localRow(2, 3000, hlc(3000)) },
    };
    const plan = planImport(
      parsed([
        fileRow(1, 2000, { deletedAt: hlc(2000) }),
        // O arquivo traz a linha viva, mais velha que a lápide local.
        fileRow(2, 2000),
      ]),
      local,
    );

    expect(plan.counts.budgets).toEqual({ created: 0, updated: 0, deleted: 1, ignored: 1 });
    expect(plan.rows.budgets?.[0]?.deletedAt).toBe(hlc(2000));
  });

  it("lapide de linha que nao existe aqui e gravada, para o sync propagar", () => {
    const plan = planImport(parsed([fileRow(1, 1000, { deletedAt: hlc(1000) })]), {});

    expect(plan.counts.budgets.deleted).toBe(1);
    expect(plan.total).toBe(1);
  });

  it("mesmo arquivo de novo: tudo ignorado", () => {
    const rows = [fileRow(1, 1000), fileRow(2, 1500, { deletedAt: hlc(1500) })];
    const first = planImport(parsed(rows), {});
    const local: LocalRows = {
      budgets: Object.fromEntries((first.rows.budgets ?? []).map((r) => [r.id, r])),
    };
    const second = planImport(parsed(rows), local);

    expect(second.counts.budgets).toEqual({ created: 0, updated: 0, deleted: 0, ignored: 2 });
    expect(second.total).toBe(0);
    expect(second.maxHlc).toBeNull();
  });

  it("id repetido no arquivo: so a versao mais nova concorre", () => {
    const plan = planImport(parsed([fileRow(1, 1000), fileRow(1, 2000)]), {});

    expect(plan.counts.budgets).toEqual({ created: 1, updated: 0, deleted: 0, ignored: 1 });
    expect(plan.rows.budgets?.[0]?.updatedAt).toBe(hlc(2000));
  });

  it("maxHlc e o maior updatedAt/deletedAt gravado", () => {
    const plan = planImport(
      parsed([fileRow(1, 1000), fileRow(2, 5000, { deletedAt: hlc(5000, 3) })]),
      { budgets: { [id(3)]: localRow(3, 9000) } },
    );

    expect(plan.maxHlc).toBe(hlc(5000, 3));
  });

  it("descarta dirty que viesse no arquivo e guarda campos desconhecidos", () => {
    const plan = planImport(parsed([fileRow(1, 1000, { dirty: 0, extra: "x" })]), {});

    expect(plan.rows.budgets?.[0]).toMatchObject({ dirty: 1, extra: "x" });
  });

  it("idsByTable lista so tabelas com linhas, sem repetir", () => {
    expect(idsByTable(parsed([fileRow(1, 1), fileRow(1, 2), fileRow(2, 1)]))).toEqual({
      budgets: [id(1), id(2)],
    });
  });
});
