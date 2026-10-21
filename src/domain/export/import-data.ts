import { compareHlc, parseHlc } from "../clock/hlc";
import { type RowsByTable, TABLE_NAMES, type TableName } from "../model/app-state";
import type { BaseRow } from "../model/base";
import { EXPORT_APP, EXPORT_FORMAT_VERSION } from "./export-data";

/**
 * Teto do arquivo aceito. Uma foto de perfil em data URL pesa algumas centenas
 * de kb, então 30 MB cabe anos de lançamentos; acima disso, parsear numa só
 * volta travaria o aparelho mais fraco, e o arquivo provavelmente não é nosso.
 */
export const MAX_IMPORT_BYTES = 30 * 1024 * 1024;

/** 26 chars Crockford, não ULID estrito: `stableEntityId` usa o alfabeto inteiro. */
const ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Linha como veio do arquivo: campos que não conhecemos seguem junto, intactos. */
export type ImportedRow = Omit<BaseRow, "dirty"> & Record<string, unknown>;

export interface ParsedImport {
  formatVersion: number;
  /** Só informativo para a prévia; nunca decide nada. */
  exportedAt: string | null;
  tables: { [K in TableName]?: ImportedRow[] };
  /** Tabelas do arquivo que esta versão não conhece: ignoradas e contadas. */
  unknownTables: string[];
}

export type ParseResult = { ok: true; file: ParsedImport } | { ok: false; message: string };

function reject(message: string): ParseResult {
  return { ok: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lê e valida o texto do arquivo. Qualquer problema rejeita o arquivo INTEIRO:
 * importar metade de um arquivo estragado deixaria o aparelho num estado que
 * nem o arquivo nem a pessoa reconhecem. Tabela desconhecida é a exceção, porque
 * é o que um app mais novo exporta e este ainda não entende.
 */
export function parseImport(text: string): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) {
    return reject("O arquivo é grande demais para importar (limite de 30 MB).");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return reject("Este arquivo não é um JSON válido. Escolha o arquivo baixado em Exportar.");
  }
  if (!isRecord(raw) || raw.app !== EXPORT_APP) {
    return reject("Este arquivo não foi gerado pelo HomeFinance.");
  }
  const { formatVersion, tables, exportedAt } = raw;
  if (typeof formatVersion !== "number" || !Number.isInteger(formatVersion) || formatVersion < 1) {
    return reject("Este arquivo não tem uma versão de formato válida.");
  }
  if (formatVersion > EXPORT_FORMAT_VERSION) {
    return reject(
      "Este arquivo foi gerado por uma versão mais nova do HomeFinance. Atualize o app e tente de novo.",
    );
  }
  if (!isRecord(tables)) return reject("O arquivo não traz as tabelas de dados.");

  const parsed: ParsedImport = {
    formatVersion,
    exportedAt: typeof exportedAt === "string" ? exportedAt : null,
    tables: {},
    unknownTables: [],
  };

  for (const [name, list] of Object.entries(tables)) {
    if (!(TABLE_NAMES as readonly string[]).includes(name)) {
      parsed.unknownTables.push(name);
      continue;
    }
    if (!Array.isArray(list)) return reject(`A tabela "${name}" do arquivo não é uma lista.`);
    const rows: ImportedRow[] = [];
    for (const [position, entry] of list.entries()) {
      const problem = checkRow(entry);
      if (problem !== null) {
        return reject(`Linha ${position + 1} da tabela "${name}" inválida: ${problem}.`);
      }
      rows.push(entry as ImportedRow);
    }
    parsed.tables[name as TableName] = rows;
  }
  return { ok: true, file: parsed };
}

function checkRow(entry: unknown): string | null {
  if (!isRecord(entry)) return "não é um objeto";
  const { id, createdAt, updatedAt, deletedAt } = entry;
  if (typeof id !== "string" || !ID.test(id)) return "id malformado";
  if (typeof createdAt !== "string") return "createdAt ausente";
  if (typeof updatedAt !== "string" || parseHlc(updatedAt) === null) return "updatedAt malformado";
  if (deletedAt !== null && (typeof deletedAt !== "string" || parseHlc(deletedAt) === null)) {
    return "deletedAt malformado";
  }
  return null;
}

/** Ids do arquivo por tabela: o que a camada de dados precisa ler do banco para planejar. */
export function idsByTable(file: ParsedImport): { [K in TableName]?: string[] } {
  const out: { [K in TableName]?: string[] } = {};
  for (const table of TABLE_NAMES) {
    const rows = file.tables[table];
    if (rows !== undefined && rows.length > 0) out[table] = [...new Set(rows.map((r) => r.id))];
  }
  return out;
}

/** Linhas locais com os ids do arquivo (as que existem), por tabela. */
export type LocalRows = { [K in TableName]?: Record<string, BaseRow> };

export interface TableCounts {
  /** Não existia no aparelho e entra viva. */
  created: number;
  /** Existia, o arquivo é estritamente mais novo e a linha continua viva. */
  updated: number;
  /** Tem lápide mais nova que a linha local (ou que a ausência dela): entra a lápide. */
  deleted: number;
  /** Local igual, mais novo ou duplicada no arquivo: nada muda. */
  ignored: number;
}

export interface ImportPlan {
  counts: { [K in TableName]: TableCounts };
  /** Linhas prontas para gravar, `dirty: 1`. */
  rows: RowsByTable;
  /** `updatedAt` lido do banco de cada linha que será gravada (`null` = ausente). */
  expected: { [K in TableName]?: Record<string, string | null> };
  /** Total de linhas que mudam o aparelho. */
  total: number;
  /** Maior HLC (updatedAt/deletedAt) gravado, para `observe()` do relógio. */
  maxHlc: string | null;
  unknownTables: string[];
  exportedAt: string | null;
}

const emptyCounts = (): TableCounts => ({ created: 0, updated: 0, deleted: 0, ignored: 0 });

/**
 * Decide, linha a linha, o que o arquivo muda. Mesma regra do pull do sync:
 * a linha do arquivo só substitui a local se `updatedAt` for ESTRITAMENTE maior
 * (`compareHlc`). Daí saem as outras garantias:
 *
 * - nunca apaga o que está no aparelho e fora do arquivo: o plano só tem linhas
 *   do arquivo;
 * - lápide do arquivo só vale contra linha local mais velha, e lápide local mais
 *   nova que a linha do arquivo vence (a linha do arquivo é ignorada);
 * - importar duas vezes o mesmo arquivo é tudo "ignorado" na segunda.
 *
 * Não lê o relógio nem o banco: `local` já vem lido.
 */
export function planImport(file: ParsedImport, local: LocalRows): ImportPlan {
  const counts = {} as { [K in TableName]: TableCounts };
  const rows: RowsByTable = {};
  const expected: ImportPlan["expected"] = {};
  let total = 0;
  let maxHlc: string | null = null;

  const bump = (hlc: string | null) => {
    if (hlc !== null && (maxHlc === null || compareHlc(hlc, maxHlc) > 0)) maxHlc = hlc;
  };

  for (const table of TABLE_NAMES) {
    const tally = emptyCounts();
    counts[table] = tally;
    const existing = local[table] ?? {};
    // Id repetido no arquivo: só a versão mais nova concorre, as outras são ignoradas.
    const winners = new Map<string, ImportedRow>();
    for (const row of file.tables[table] ?? []) {
      const seen = winners.get(row.id);
      if (seen === undefined) winners.set(row.id, row);
      else {
        tally.ignored += 1;
        if (compareHlc(row.updatedAt, seen.updatedAt) > 0) winners.set(row.id, row);
      }
    }

    const toWrite: BaseRow[] = [];
    const versions: Record<string, string | null> = {};
    for (const row of winners.values()) {
      const current = existing[row.id];
      if (current !== undefined && compareHlc(row.updatedAt, current.updatedAt) <= 0) {
        tally.ignored += 1;
        continue;
      }
      if (row.deletedAt !== null) tally.deleted += 1;
      else if (current === undefined) tally.created += 1;
      else tally.updated += 1;
      toWrite.push({ ...row, dirty: 1 } as unknown as BaseRow);
      versions[row.id] = current?.updatedAt ?? null;
      bump(row.updatedAt);
      bump(row.deletedAt);
    }
    if (toWrite.length > 0) {
      (rows as Record<TableName, BaseRow[]>)[table] = toWrite;
      expected[table] = versions;
      total += toWrite.length;
    }
  }

  return {
    counts,
    rows,
    expected,
    total,
    maxHlc,
    unknownTables: file.unknownTables,
    exportedAt: file.exportedAt,
  };
}
