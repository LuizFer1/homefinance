import { batch, type Signal, signal } from "@preact/signals";
import type { Table } from "dexie";
import type { CrudDb } from "../../data/crud-db";
import { createRepository, type Repository } from "../../data/repository";
import { compareHlc, parseHlc } from "../../domain/clock/hlc";
import { createRowClock, type RowClock } from "../../domain/clock/row-clock";
import { createUlidFactory, type RandomChunk, type Ulid } from "../../domain/ids/ulid";
import {
  type AppState,
  EMPTY_APP_STATE,
  type RowOf,
  type RowsByTable,
  TABLE_NAMES,
  type TableName,
} from "../../domain/model/app-state";
import type { BaseRow } from "../../domain/model/base";

const DEVICE_ID_KEY = "deviceId";

/**
 * Qual perfil sou **eu** neste aparelho. Estado de dispositivo, nunca
 * sincronizado: depois do sync o perfil da outra pessoa estará na tabela, e
 * derivar o primeiro uso de "existe algum user" pularia o cadastro.
 */
export const LOCAL_USER_ID_KEY = "localUserId";

/**
 * Formato de `meta` aceito por `putRows`: só `localUserId`, nunca `deviceId`.
 * Exportado para quem monta o lote fora da sessão (ex. `buildOnboardingRows`)
 * declarar o mesmo tipo em vez de reinventar um `Record<string, string>` que
 * o compilador não amarraria a este contrato.
 */
export type SessionMeta = Partial<Record<typeof LOCAL_USER_ID_KEY, Ulid>>;

export type SessionStatus = "loading" | "ready" | "error";

export interface CrudSessionDeps {
  db: CrudDb;
  now: () => number;
  randomChunk: RandomChunk;
}

/**
 * Estado em memória e porta de escrita compartilhados por todas as stores.
 * Grava primeiro, publica depois: se o banco rejeitar, a tela não muda.
 */
export interface CrudSession {
  state: Signal<AppState>;
  status: Signal<SessionStatus>;
  error: Signal<string | null>;
  /** Nulo enquanto o primeiro uso não concluiu **neste** aparelho. */
  localUserId: Signal<Ulid | null>;
  init: () => Promise<void>;
  /** Lança se chamado antes de `init` concluir. */
  clock: () => RowClock;
  /**
   * Uma escrita atômica numa tabela: `op` deve fazer **uma única** chamada ao
   * repositório (a linha que ela devolve é a única publicada no `state`). Se
   * `op` gravar mais de uma vez, só a devolvida entra no estado em memória —
   * mesmo que a transação grave as duas no banco. Falha (incluindo `clock()`
   * chamado antes do `init` concluir) preenche `error` **e relança**; nada
   * fica gravado, porque `op` roda dentro da transação da tabela.
   *
   * Dentro de `op`, só chamadas ao repositório — nenhum `await` de outra
   * coisa. Qualquer `await` que não seja do IndexedDB (rede, `setTimeout`,
   * processamento de imagem) encerra a transação do Dexie por inatividade
   * (`TransactionInactiveError`), e uma subtransação que falha aborta a
   * externa mesmo que quem chamou `mutate` capture o erro num `try/catch`.
   */
  mutate: <K extends TableName>(
    table: K,
    op: (repo: Repository<RowOf<K>>) => Promise<RowOf<K>>,
  ) => Promise<RowOf<K>>;
  /**
   * Lote atômico de linhas prontas (`buildRow`) mais, opcionalmente,
   * `localUserId`. Restrito a essa única chave — nunca `deviceId` — porque
   * `putRows` é a porta de lotes usada por primeiro uso e materialização, e
   * nenhum dos dois tem motivo para reescrever a identidade do aparelho.
   */
  putRows: (rows: RowsByTable, meta?: SessionMeta) => Promise<void>;
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function toRecord<T extends BaseRow>(rows: readonly T[]): Record<Ulid, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

/**
 * Semente do relógio: o maior HLC já gravado, para ele não regredir.
 *
 * `parseHlc` descarta qualquer valor que não seja um HLC bem formado — uma
 * coluna corrompida ou de uma versão futura do schema não pode virar semente,
 * porque `compareHlc` é comparação de string pura e um valor fora do formato
 * de largura fixa compararia como maior ou menor sem relação com o instante
 * real.
 */
function latestHlc(state: AppState): string | null {
  let max: string | null = null;
  for (const table of TABLE_NAMES) {
    for (const row of Object.values(state[table])) {
      for (const hlc of [row.updatedAt, row.deletedAt]) {
        if (hlc !== null && parseHlc(hlc) !== null && (max === null || compareHlc(hlc, max) > 0)) {
          max = hlc;
        }
      }
    }
  }
  return max;
}

/**
 * Substitui as linhas recebidas no estado. O cast existe porque a chave
 * computada de um `TableName` em união não deixa o TypeScript provar que cada
 * lista cai no bucket certo; `RowsByTable` garante isso por construção.
 */
function withRows(state: AppState, rows: RowsByTable): AppState {
  let next = state;
  for (const table of TABLE_NAMES) {
    const list = rows[table];
    if (list === undefined || list.length === 0) continue;
    next = { ...next, [table]: { ...next[table], ...toRecord<BaseRow>(list) } } as AppState;
  }
  return next;
}

export function createCrudSession(deps: CrudSessionDeps): CrudSession {
  const state = signal<AppState>(EMPTY_APP_STATE);
  const status = signal<SessionStatus>("loading");
  const error = signal<string | null>(null);
  const localUserId = signal<Ulid | null>(null);
  let rowClock: RowClock | null = null;

  function clock(): RowClock {
    if (rowClock === null) throw new Error("Sessão não inicializada");
    return rowClock;
  }

  function tableOf<K extends TableName>(table: K): Table<RowOf<K>, string> {
    return deps.db.table<RowOf<K>, string>(table);
  }

  async function init(): Promise<void> {
    try {
      const stored = await deps.db.meta.get(DEVICE_ID_KEY);
      const deviceId = stored?.value ?? createUlidFactory(deps.randomChunk)(deps.now());
      if (stored === undefined) await deps.db.meta.put({ key: DEVICE_ID_KEY, value: deviceId });

      const perfil = (await deps.db.meta.get(LOCAL_USER_ID_KEY))?.value ?? null;
      const [users, categories, paymentMethods, transactions, recurrences] = await Promise.all([
        deps.db.users.toArray(),
        deps.db.categories.toArray(),
        deps.db.paymentMethods.toArray(),
        deps.db.transactions.toArray(),
        deps.db.recurrences.toArray(),
      ]);
      const loaded: AppState = {
        users: toRecord(users),
        categories: toRecord(categories),
        paymentMethods: toRecord(paymentMethods),
        transactions: toRecord(transactions),
        recurrences: toRecord(recurrences),
      };

      rowClock = createRowClock({
        deviceId,
        initialHlc: latestHlc(loaded),
        now: deps.now,
        randomChunk: deps.randomChunk,
      });

      // Uma atualização só: `ready` com estado vazio faria a tela piscar
      // "Nenhum lançamento ainda" antes dos dados do disco.
      batch(() => {
        state.value = loaded;
        localUserId.value = perfil;
        status.value = "ready";
      });
    } catch (cause) {
      batch(() => {
        status.value = "error";
        error.value = describeError(cause);
      });
    }
  }

  async function mutate<K extends TableName>(
    table: K,
    op: (repo: Repository<RowOf<K>>) => Promise<RowOf<K>>,
  ): Promise<RowOf<K>> {
    let row: RowOf<K>;
    try {
      // `clock()` entra no try: chamar `mutate` antes do `init` concluir é um
      // erro de uso, mas ainda precisa preencher `error` como qualquer outra
      // falha de escrita — quem só observa o signal não pode perder o motivo.
      const table$ = tableOf(table);
      const repo = createRepository(table$, clock());
      // A transação torna `op` atômico: se ela gravar e depois lançar, o
      // Dexie desfaz a gravação. `repository.update`/`remove` reaproveitam
      // esta mesma transação em vez de abrir uma própria.
      row = await table$.db.transaction("rw", table$, () => op(repo));
    } catch (cause) {
      error.value = describeError(cause);
      throw cause;
    }
    batch(() => {
      error.value = null;
      state.value = withRows(state.value, { [table]: [row] } as RowsByTable);
    });
    return row;
  }

  async function putRows(rows: RowsByTable, meta: SessionMeta = {}): Promise<void> {
    const tables = TABLE_NAMES.filter((table) => (rows[table]?.length ?? 0) > 0);
    try {
      await deps.db.transaction(
        "rw",
        [...tables.map((table) => deps.db.table(table)), deps.db.meta],
        async () => {
          for (const table of tables) await deps.db.table(table).bulkPut(rows[table] ?? []);
          // `value === undefined` é descartado: `{ localUserId: undefined }`
          // compila (a chave é opcional) mas, sem este filtro, gravaria
          // `{ key: "localUserId" }` sem `value` no IndexedDB — uma linha de
          // `meta` corrompida em vez de simplesmente não escrever nada.
          for (const [key, value] of Object.entries(meta)) {
            if (value === undefined) continue;
            await deps.db.meta.put({ key, value });
          }
        },
      );
    } catch (cause) {
      error.value = describeError(cause);
      throw cause;
    }

    const perfil = meta[LOCAL_USER_ID_KEY];
    batch(() => {
      error.value = null;
      state.value = withRows(state.value, rows);
      if (perfil !== undefined) localUserId.value = perfil;
    });
  }

  return { state, status, error, localUserId, init, clock, mutate, putRows };
}
