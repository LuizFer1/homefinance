import {
  type ImportPlan,
  idsByTable,
  type LocalRows,
  MAX_IMPORT_BYTES,
  type ParsedImport,
  parseImport,
  planImport,
} from "../domain/export/import-data";
import { TABLE_NAMES } from "../domain/model/app-state";
import type { BaseRow } from "../domain/model/base";
import type { Session } from "../features/session/session";
import type { HomeFinanceDb } from "./db";

export type PrepareResult = { ok: true; plan: ImportPlan } | { ok: false; message: string };

/** Cede a thread para a UI pintar "Lendo o arquivo…" antes do parse pesado. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Lê as linhas locais com os ids do arquivo, num snapshot só. Lê do IndexedDB e
 * não da memória: o plano é a base de `expected`, e `putRowsIfCurrent` compara
 * com o banco. Só `bulkGet` dos ids do arquivo — o resto do banco não importa
 * para decidir, e o arquivo grande não carrega a base inteira duas vezes.
 */
export async function readLocalRows(
  db: Pick<HomeFinanceDb, "table" | "transaction">,
  file: ParsedImport,
): Promise<LocalRows> {
  const ids = idsByTable(file);
  const tables = TABLE_NAMES.filter((name) => (ids[name]?.length ?? 0) > 0).map((name) =>
    db.table(name),
  );
  const local: Record<string, Record<string, BaseRow>> = {};
  if (tables.length === 0) return local as LocalRows;
  await db.transaction("r", tables, async () => {
    for (const table of tables) {
      const found = await table.bulkGet(ids[table.name as keyof typeof ids] ?? []);
      local[table.name] = Object.fromEntries(
        found.filter((row): row is BaseRow => row !== undefined).map((row) => [row.id, row]),
      );
    }
  });
  return local as LocalRows;
}

/**
 * Do arquivo escolhido até o plano (a prévia). Nada é gravado aqui. Nunca
 * rejeita por conteúdo ruim: devolve a mensagem para a tela mostrar; só falha de
 * leitura do banco/arquivo sobe como exceção.
 */
export async function prepareImport(
  db: Pick<HomeFinanceDb, "table" | "transaction">,
  file: Pick<File, "size" | "text">,
): Promise<PrepareResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, message: "O arquivo é grande demais para importar (limite de 30 MB)." };
  }
  const text = await file.text();
  await yieldToUi();
  const parsed = parseImport(text);
  if (!parsed.ok) return parsed;
  return { ok: true, plan: planImport(parsed.file, await readLocalRows(db, parsed.file)) };
}

/**
 * Grava o plano num lote atômico. `expected` é o que o planejamento leu: se o
 * banco mudou desde então (outra aba, sync), `putRowsIfCurrent` lança
 * `StaleRowsError` sem gravar nada.
 *
 * Nunca toca na `meta`: credenciais do hub, cursor e `localUserId` são do
 * aparelho, e `putRowsIfCurrent` não recebe meta.
 */
export async function applyImport(session: Session, plan: ImportPlan): Promise<void> {
  if (plan.total === 0) return;
  // Antes de gravar e síncrono, como no pull do sync: qualquer edição local a
  // partir daqui já nasce acima do que está chegando e não perde o LWW para ele.
  if (plan.maxHlc !== null) session.clock().observe(plan.maxHlc);
  await session.putRowsIfCurrent(plan.rows, plan.expected);
  try {
    await session.reload();
  } catch {
    // O lote já está no banco e publicado; um reload que falha não desfaz isso.
  }
}
