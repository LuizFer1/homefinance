import type { AppState } from "../domain/model/app-state";
import { TABLE_NAMES } from "../domain/model/app-state";
import type { HomeFinanceDb } from "./db";

/**
 * Lê todas as tabelas de entidade do banco, lápides inclusive, num snapshot só.
 *
 * Lê do IndexedDB e não do estado em memória da sessão: o arquivo é a cópia de
 * segurança, e tem que refletir o que está gravado, não o que a tela publicou.
 * Uma transação "r" sobre todas as tabelas evita um arquivo com a tabela A de
 * antes e a B de depois de uma edição. A `meta` fica de fora de propósito.
 */
export async function readAllRows(db: Pick<HomeFinanceDb, "table" | "transaction">) {
  const tables = TABLE_NAMES.map((name) => db.table(name));
  const lists = await db.transaction("r", tables, () =>
    Promise.all(tables.map((t) => t.toArray())),
  );
  const state: Record<string, Record<string, unknown>> = {};
  TABLE_NAMES.forEach((name, index) => {
    state[name] = Object.fromEntries((lists[index] ?? []).map((row) => [row.id, row]));
  });
  return state as unknown as AppState;
}

export interface DownloadDeps {
  doc: Pick<Document, "createElement" | "body">;
  url: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
}

/**
 * Entrega o texto como arquivo pelo navegador: Blob + link com `download`.
 * Não toca na rede, então funciona offline. O link vai ao `body` porque o
 * Firefox só dispara o clique de âncora que está no documento.
 */
export function downloadTextFile(
  deps: DownloadDeps,
  fileName: string,
  text: string,
  mime = "application/json",
): void {
  const href = deps.url.createObjectURL(new Blob([text], { type: mime }));
  const link = deps.doc.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  deps.doc.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // O clique já iniciou o download; soltar na mesma volta cancelaria em alguns navegadores.
    setTimeout(() => deps.url.revokeObjectURL(href), 10_000);
  }
}
