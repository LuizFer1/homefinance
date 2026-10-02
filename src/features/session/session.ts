import { batch, type Signal, signal } from "@preact/signals";
import type { Table } from "dexie";
import type { HomeFinanceDb } from "../../data/db";
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

/**
 * Versão (`updatedAt`) que quem chama leu de cada linha antes de planejar a
 * escrita; `null` quer dizer "esta linha ainda não pode existir".
 */
export type ExpectedVersions = { [K in TableName]?: Record<Ulid, string | null> };

/**
 * O banco já não tem o que a sessão leu: outra aba (ou o sync) mudou, apagou
 * ou criou uma das linhas depois do boot. Gravar mesmo assim ressuscitaria a
 * linha apagada ou atropelaria a edição feita lá.
 */
export class StaleRowsError extends Error {
  constructor() {
    super("Os dados mudaram em outra aba. Feche e abra o reajuste de novo.");
    this.name = "StaleRowsError";
  }
}

export type SessionStatus = "loading" | "ready" | "error";

export interface SessionDeps {
  db: HomeFinanceDb;
  now: () => number;
  randomChunk: RandomChunk;
}

/**
 * Estado em memória e porta de escrita compartilhados por todas as stores.
 * Grava primeiro, publica depois: se o banco rejeitar, a tela não muda.
 */
export interface Session {
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
  /**
   * Como `putRows`, mas só grava se cada linha de `expected` ainda estiver no
   * banco com o `updatedAt` esperado (ou ausente, se o esperado for `null`).
   * Para lotes planejados a partir do `state` em memória que regravam linhas
   * inteiras: o state pode estar velho (outra aba, sync), e um `bulkPut` cego
   * reviveria uma linha apagada lá ou desfaria uma edição à mão.
   *
   * A checagem e a escrita são uma transação só. Divergiu: nada é gravado,
   * `error` é preenchido, o `state` recebe o que o banco realmente tem para
   * aqueles ids (a sessão se cura, como em `insertMissing`) e lança
   * `StaleRowsError`.
   */
  putRowsIfCurrent: (rows: RowsByTable, expected: ExpectedVersions) => Promise<void>;
  /**
   * Insere só as linhas cujo id ainda não existe no banco — nunca sobrescreve.
   * Para identidade determinística (materialização): o state em memória pode
   * estar velho (outra aba, sync), então a checagem é feita dentro da transação.
   *
   * Ids em `rows` precisam ser únicos: repetido derruba o lote com
   * ConstraintError.
   */
  insertMissing: <K extends TableName>(table: K, rows: RowOf<K>[]) => Promise<RowOf<K>[]>;
  /**
   * Relê todas as tabelas do banco e publica o estado numa atualização só.
   * Para quem grava fora de `mutate`/`putRows` — o sync grava páginas inteiras
   * por conta própria —, é o jeito de o estado em memória voltar a ser o
   * espelho do disco. Falha preenche `error` e relança; sucesso não o limpa.
   */
  reload: () => Promise<void>;
}

/** Mensagem legível de uma falha qualquer, para `error` e para as telas. */
export function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Para chamadas fire-and-forget da UI. A falha já está em `session.error`, que
 * a tela mostra; isto só impede a rejeição de virar "unhandled".
 */
export function ignoreHandled(): void {}

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

export function createSession(deps: SessionDeps): Session {
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

  async function loadAll(): Promise<AppState> {
    // Uma transação "r" sobre todas as tabelas: um snapshot só. Com leituras
    // soltas, uma edição podia gravar e publicar entre a leitura da tabela
    // dela e a publicação do reload, que então a cobria com o valor velho. Na
    // transação, a escrita espera a leitura acabar e publica por cima dela.
    const tables = TABLE_NAMES.map((table) => deps.db.table(table));
    const [users, categories, paymentMethods, transactions, recurrences, recurrenceAdjustments] =
      await deps.db.transaction("r", tables, () =>
        Promise.all([
          deps.db.users.toArray(),
          deps.db.categories.toArray(),
          deps.db.paymentMethods.toArray(),
          deps.db.transactions.toArray(),
          deps.db.recurrences.toArray(),
          deps.db.recurrenceAdjustments.toArray(),
        ]),
      );
    return {
      users: toRecord(users),
      categories: toRecord(categories),
      paymentMethods: toRecord(paymentMethods),
      transactions: toRecord(transactions),
      recurrences: toRecord(recurrences),
      recurrenceAdjustments: toRecord(recurrenceAdjustments),
    };
  }

  async function reload(): Promise<void> {
    let loaded: AppState;
    try {
      loaded = await loadAll();
    } catch (cause) {
      error.value = describeError(cause);
      throw cause;
    }
    // O relógio salta para o maior HLC do disco: uma linha recebida do hub pode
    // estar à frente dele, e uma escrita local carimbada abaixo perderia o LWW.
    const latest = latestHlc(loaded);
    if (latest !== null) rowClock?.observe(latest);
    // `error` fica como está: ele é de uma escrita da pessoa, que a tela ainda
    // mostra, e um reload bem-sucedido não diz nada sobre ela.
    state.value = loaded;
  }

  async function init(): Promise<void> {
    try {
      const stored = await deps.db.meta.get(DEVICE_ID_KEY);
      const deviceId = stored?.value ?? createUlidFactory(deps.randomChunk)(deps.now());
      if (stored === undefined) await deps.db.meta.put({ key: DEVICE_ID_KEY, value: deviceId });

      const perfil = (await deps.db.meta.get(LOCAL_USER_ID_KEY))?.value ?? null;
      const loaded = await loadAll();

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

  async function putRowsIfCurrent(rows: RowsByTable, expected: ExpectedVersions): Promise<void> {
    const tables = TABLE_NAMES.filter(
      (table) => (rows[table]?.length ?? 0) > 0 || Object.keys(expected[table] ?? {}).length > 0,
    );
    let actual: RowsByTable = {};
    let stale = false;
    try {
      // Ler e gravar na mesma transação: checar fora dela abriria uma janela
      // em que a outra aba grava entre a checagem e o `bulkPut`.
      await deps.db.transaction(
        "rw",
        tables.map((table) => deps.db.table(table)),
        async () => {
          const found: RowsByTable = {};
          for (const table of tables) {
            const versions = expected[table] ?? {};
            const ids = Object.keys(versions);
            if (ids.length === 0) continue;
            const current = await deps.db.table<BaseRow, string>(table).bulkGet(ids);
            const present = current.filter((row): row is BaseRow => row !== undefined);
            (found as Record<TableName, BaseRow[]>)[table] = present;
            ids.forEach((id, index) => {
              if ((current[index]?.updatedAt ?? null) !== versions[id]) stale = true;
            });
          }
          actual = found;
          // Lança antes de qualquer escrita: a transação nem chega a gravar.
          if (stale) throw new StaleRowsError();
          for (const table of tables) {
            const list = rows[table] ?? [];
            if (list.length > 0) await deps.db.table(table).bulkPut(list);
          }
        },
      );
    } catch (cause) {
      batch(() => {
        error.value = describeError(cause);
        if (stale) state.value = withRows(state.value, actual);
      });
      throw cause;
    }

    batch(() => {
      error.value = null;
      state.value = withRows(state.value, rows);
    });
  }

  async function insertMissing<K extends TableName>(
    table: K,
    rows: RowOf<K>[],
  ): Promise<RowOf<K>[]> {
    const table$ = tableOf(table);
    let inserted: RowOf<K>[] = [];
    let existing: RowOf<K>[] = [];
    try {
      // `bulkGet` + `bulkAdd` isolados numa transação: sem ela, duas chamadas
      // concorrentes poderiam ver a mesma linha como ausente e as duas
      // tentarem inserir. `bulkAdd` também rejeita se uma linha "ausente" na
      // leitura já existir de fato — outra rede de segurança contra a corrida.
      await table$.db.transaction("rw", table$, async () => {
        const ids = rows.map((row) => row.id);
        const current = await table$.bulkGet(ids);
        inserted = rows.filter((_, index) => current[index] === undefined);
        existing = current.filter((row): row is RowOf<K> => row !== undefined);
        if (inserted.length > 0) await table$.bulkAdd(inserted);
      });
    } catch (cause) {
      error.value = describeError(cause);
      throw cause;
    }

    // Publica as inseridas e as que já existiam: uma sessão com o `state`
    // desatualizado (outra aba, boot antigo) se atualiza com o que o banco
    // realmente tem, em vez de continuar sem saber da linha.
    batch(() => {
      error.value = null;
      state.value = withRows(state.value, { [table]: [...inserted, ...existing] } as RowsByTable);
    });
    return inserted;
  }

  return {
    state,
    status,
    error,
    localUserId,
    init,
    clock,
    mutate,
    putRows,
    putRowsIfCurrent,
    insertMissing,
    reload,
  };
}
