import type { HomeFinanceDb } from "../data/db";
import {
  HUB_KEYS,
  type HubLink,
  markRevoked,
  readHubLink,
  resetForEpoch,
  tableSetKey,
  touchLastSync,
} from "../data/hub-link";
import { compareHlc } from "../domain/clock/hlc";
import type { Ulid } from "../domain/ids/ulid";
import { TABLE_NAMES, type TableName } from "../domain/model/app-state";
import type { BaseRow } from "../domain/model/base";
import { checkRemoteRow, PULL_LIMIT, PUSH_BATCH, type PushEntry } from "./protocol";
import { type HubTransport, SyncError } from "./transport";

export interface SyncEngineDeps {
  db: HomeFinanceDb;
  transport: HubTransport;
  deviceId: Ulid;
  /** `RowClock.observe`: o relógio salta antes de a página ser gravada. */
  observe: (hlc: string) => void;
  now: () => number;
  pushBatch?: number;
  pullLimit?: number;
}

export interface RejectedRow {
  table: string;
  id: string;
  error: string;
  message: string;
}

export interface SyncSummary {
  pushed: number;
  ignored: number;
  rejected: RejectedRow[];
  pulled: number;
  /** Linhas de tabela conhecida fora do formato de `BaseRow`. */
  invalid: number;
  /** Tabelas que esta versão não conhece e que o hub mandou. */
  unknownTables: string[];
  epochReset: boolean;
}

/** Guarda contra um hub que nunca diz `hasMore: false`. */
const MAX_PAGES = 10_000;

/**
 * Dentro da transação que grava: a ligação ainda é a desta rodada? Outra aba
 * (ou um pareamento que não esperou) pode ter trocado ou apagado a chave
 * enquanto a resposta vinha, e gravar agora poria `dirty: 0` e o cursor do hub
 * antigo por cima da ligação nova — linhas que nunca chegariam ao hub novo.
 */
async function assertSameLink(db: HomeFinanceDb, link: HubLink): Promise<void> {
  const current = await db.meta.get(HUB_KEYS.key);
  if (current?.value !== link.key) {
    throw new SyncError("hub", "A ligação com o hub mudou durante a sincronização.");
  }
}

function emptySummary(): SyncSummary {
  return {
    pushed: 0,
    ignored: 0,
    rejected: [],
    pulled: 0,
    invalid: 0,
    unknownTables: [],
    epochReset: false,
  };
}

/**
 * Uma rodada: push das linhas `dirty`, depois pull de `seq > cursor`.
 *
 * Push primeiro: o que a pessoa acabou de editar fica seguro no hub antes de
 * qualquer linha local ser sobrescrita, o `rejected` aparece na mesma rodada e
 * o pull que vem depois já devolve `cursor = MAX(seq)`, passando pelas
 * próprias linhas. As duas ordens convergem — esta deixa o envio visível.
 */
export async function runSync(deps: SyncEngineDeps): Promise<SyncSummary> {
  const link = await readHubLink(deps.db);
  if (link === null) throw new SyncError("hub", "Este aparelho não está pareado com um hub.");

  let summary: SyncSummary;
  try {
    summary = await attempt(deps, link);
  } catch (cause) {
    if (cause instanceof SyncError && cause.kind === "epoch_mismatch" && cause.epoch !== null) {
      // O cursor antigo aponta para outro banco: tudo volta a `dirty` e a
      // rodada recomeça. Uma vez só — um segundo 409 é hub instável, não laço.
      await resetForEpoch(deps.db, cause.epoch);
      summary = await attempt(deps, { ...link, epoch: cause.epoch, cursor: 0 });
      summary.epochReset = true;
    } else {
      if (cause instanceof SyncError && cause.kind === "unauthorized") await markRevoked(deps.db);
      throw cause;
    }
  }

  await touchLastSync(deps.db, new Date(deps.now()).toISOString());
  return summary;
}

async function attempt(deps: SyncEngineDeps, link: HubLink): Promise<SyncSummary> {
  const summary = emptySummary();
  await pushDirty(deps, link, summary);
  await pullPages(deps, link, summary);
  return summary;
}

async function pushDirty(deps: SyncEngineDeps, link: HubLink, summary: SyncSummary): Promise<void> {
  const entries: PushEntry[] = [];
  for (const table of TABLE_NAMES) {
    const rows = await deps.db.table<BaseRow, string>(table).where("dirty").equals(1).toArray();
    for (const row of rows) entries.push({ table, row });
  }

  const batch = deps.pushBatch ?? PUSH_BATCH;
  for (let start = 0; start < entries.length; start += batch) {
    const chunk = entries.slice(start, start + batch);
    const response = await deps.transport.push(link.address, link.key, {
      epoch: link.epoch,
      rows: chunk,
    });

    const sentAt = new Map(
      chunk.map((entry) => [`${entry.table}/${entry.row.id}`, entry.row.updatedAt]),
    );
    const tables = [...new Set(chunk.map((entry) => entry.table))].map((table) =>
      deps.db.table(table),
    );
    // Aceitas e ignoradas limpam igual: "ignored" quer dizer que o hub já tem
    // versão igual ou mais nova, e reenviar seria o mesmo "ignored" de novo.
    const settled = [...response.accepted, ...response.ignored];
    await deps.db.transaction("rw", [...tables, deps.db.meta], async () => {
      await assertSameLink(deps.db, link);
      for (const { table, id } of settled) {
        const sent = sentAt.get(`${table}/${id}`);
        if (sent === undefined) continue;
        const table$ = deps.db.table<BaseRow, string>(table);
        const current = await table$.get(id);
        // Só limpa a versão que foi enviada: uma edição feita durante o envio
        // continua pendente e vai na próxima rodada.
        if (current !== undefined && current.dirty === 1 && current.updatedAt === sent) {
          await table$.put({ ...current, dirty: 0 });
        }
      }
    });

    summary.pushed += response.accepted.length;
    summary.ignored += response.ignored.length;
    for (const { index, error, message } of response.rejected) {
      const entry = chunk[index];
      if (entry === undefined) continue;
      summary.rejected.push({ table: entry.table, id: entry.row.id, error, message });
    }
  }
}

async function pullPages(deps: SyncEngineDeps, link: HubLink, summary: SyncSummary): Promise<void> {
  const tables = tableSetKey();
  // Tabela que a versão anterior ignorou sem conhecer ficou para trás no hub:
  // esta versão a conhece, então recomeça do zero (o resto volta como "igual").
  let cursor = link.tables === tables ? link.cursor : 0;
  const limit = deps.pullLimit ?? PULL_LIMIT;
  const allTables = TABLE_NAMES.map((table) => deps.db.table(table));

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await deps.transport.pull(link.address, link.key, {
      epoch: link.epoch,
      cursor,
      limit,
    });

    const valid: { table: TableName; row: BaseRow }[] = [];
    for (const entry of response.rows) {
      const check = checkRemoteRow(entry.table, entry.row);
      if (!check.ok) {
        if (check.reason === "unknown_table") {
          const name = String(entry.table);
          if (!summary.unknownTables.includes(name)) summary.unknownTables.push(name);
        } else {
          summary.invalid += 1;
        }
        continue;
      }
      // Antes de gravar, e síncrono: qualquer escrita local a partir daqui já
      // nasce acima do que acabou de chegar.
      deps.observe(check.row.updatedAt);
      if (check.row.deletedAt !== null) deps.observe(check.row.deletedAt);
      valid.push(check);
    }

    // Linhas e cursor na mesma transação: se o app fechar no meio, a página
    // entrou inteira com o cursor dela, ou não entrou — nunca um sem o outro.
    await deps.db.transaction("rw", [...allTables, deps.db.meta], async () => {
      await assertSameLink(deps.db, link);
      for (const { table, row } of valid) {
        const table$ = deps.db.table<BaseRow, string>(table);
        const current = await table$.get(row.id);
        if (current === undefined || compareHlc(row.updatedAt, current.updatedAt) > 0) {
          await table$.put(row);
          summary.pulled += 1;
        }
      }
      await deps.db.meta.bulkPut([
        { key: HUB_KEYS.cursor, value: String(response.cursor) },
        { key: HUB_KEYS.tables, value: tables },
      ]);
    });

    if (!response.hasMore) return;
    if (response.cursor <= cursor) throw new SyncError("protocol", "O hub não avançou o cursor.");
    cursor = response.cursor;
  }
  throw new SyncError("protocol", "O hub não terminou de mandar as páginas.");
}
