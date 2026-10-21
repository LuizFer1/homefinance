import { type AppState, type RowMap, TABLE_NAMES, type TableName } from "../model/app-state";
import type { BaseRow } from "../model/base";

/** Identifica o arquivo como nosso; uma leitura futura recusa o que não for. */
export const EXPORT_APP = "homefinance";

/**
 * Sobe quando a FORMA do arquivo muda (campo renomeado, tabela com outro
 * significado). Tabela ou campo opcional novo não sobe: quem lê ignora o que
 * não conhece, assim como o sync.
 */
export const EXPORT_FORMAT_VERSION = 1;

/** A linha como vai para o arquivo: conteúdo, sem o estado de sincronização. */
export type ExportedRow<K extends TableName> = Omit<RowMap[K], "dirty">;

export interface ExportFile {
  app: typeof EXPORT_APP;
  formatVersion: number;
  /** ISO 8601 do instante da exportação. Só informativo. */
  exportedAt: string;
  tables: { [K in TableName]: ExportedRow<K>[] };
}

/**
 * Monta o objeto do arquivo de exportação a partir do estado.
 *
 * - Inclui as lápides (`deletedAt` preenchido): sem elas, um restore
 *   ressuscitaria o que o usuário apagou, porque o aparelho de destino não teria
 *   como saber que a linha foi excluída.
 * - Tira `dirty`: ele diz se a linha já foi ao hub, e isso pertence ao aparelho
 *   que exporta, não ao conteúdo. Um restore marca as linhas como sujas por conta
 *   própria.
 * - Só entidades. A `meta` (credenciais do hub, cursor, `localUserId`) nem chega
 *   aqui: o `AppState` não a contém, e o arquivo é texto puro que o usuário
 *   guarda onde quiser.
 * - Determinístico: tabelas na ordem de `TABLE_NAMES` e linhas por `id`, para o
 *   mesmo estado e o mesmo `now` gerarem o mesmo texto (comparável e testável).
 *
 * `now` entra por parâmetro (milissegundos): este módulo não lê o relógio.
 */
export function buildExport(state: AppState, now: number): ExportFile {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLE_NAMES) {
    tables[table] = Object.values(state[table] as Record<string, BaseRow>)
      .map((row) => {
        const { dirty: _dirty, ...content } = row;
        return content;
      })
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return {
    app: EXPORT_APP,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date(now).toISOString(),
    tables: tables as ExportFile["tables"],
  };
}

/** `homefinance-AAAA-MM-DD.json`. A data é a local, a mesma que a tela mostra. */
export function exportFileName(today: string): string {
  return `homefinance-${today}.json`;
}

/** Indentado: o arquivo é para a pessoa poder abrir e conferir. */
export function serializeExport(file: ExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
