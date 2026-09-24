import type { Table } from "dexie";
import type { RowClock } from "../domain/clock/row-clock";
import type { Ulid } from "../domain/ids/ulid";
import type { BaseRow, Draft } from "../domain/model/base";

/**
 * Porta de escrita única de todas as tabelas. Toda falha rejeita — quem chama
 * precisa saber que não salvou.
 */
export interface Repository<T extends BaseRow> {
  listAll: () => Promise<T[]>;
  /** `id` explícito só para identidade determinística (materialização). */
  create: (draft: Draft<T>, id?: Ulid) => Promise<T>;
  /** LWW por linha: grava a linha inteira. Sem mudança real, não escreve. */
  update: (id: Ulid, changes: Partial<Draft<T>>) => Promise<T>;
  /** Exclusão lógica: a linha fica, com `deletedAt`, para o hub propagar. */
  remove: (id: Ulid) => Promise<T>;
}

/**
 * Monta uma linha nova sem gravar — para lotes que precisam de uma transação
 * só (primeiro uso, materialização).
 *
 * O duplo cast é o preço do genérico: `Draft<T> & BaseRow` é `T` por
 * construção, mas o TypeScript não prova isso para um `T` aberto.
 */
export function buildRow<T extends BaseRow>(clock: RowClock, draft: Draft<T>, id?: Ulid): T {
  const { hlc, iso } = clock.stamp();
  const base: BaseRow = {
    id: id ?? clock.newId(),
    createdAt: iso,
    updatedAt: hlc,
    deletedAt: null,
    dirty: 1,
  };
  return { ...draft, ...base } as unknown as T;
}

const BASE_ROW_KEYS = new Set<string>(["id", "createdAt", "updatedAt", "deletedAt", "dirty"]);

/**
 * Descarta, de `changes`, as colunas de `BaseRow` e as entradas `undefined`.
 *
 * As colunas de `BaseRow` são controladas pelo repositório, nunca por quem
 * chama `update` — sem isso, passar uma linha inteira como `changes` (ex.:
 * `{ ...outraLinha, name: "X" }`) rouba `id`/`createdAt`/`deletedAt`/`dirty`
 * de outro registro. `undefined` é descartado porque `Table.put` grava um
 * `undefined` explícito no IndexedDB — reenviar o objeto do formulário com um
 * campo ausente apagaria a coluna em vez de preservá-la.
 */
function sanitizeChanges<T extends BaseRow>(changes: Partial<Draft<T>>): Partial<Draft<T>> {
  const record = changes as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(record)) {
    if (BASE_ROW_KEYS.has(field) || value === undefined) continue;
    clean[field] = value;
  }
  return clean as Partial<Draft<T>>;
}

function hasChanges(current: object, changes: object): boolean {
  const record = current as Record<string, unknown>;
  return Object.entries(changes).some(([field, value]) => record[field] !== value);
}

export function createRepository<T extends BaseRow>(
  table: Table<T, string>,
  clock: RowClock,
): Repository<T> {
  async function load(id: Ulid): Promise<T> {
    const current = await table.get(id);
    if (current === undefined) throw new Error(`Registro ${id} não existe`);
    return current;
  }

  return {
    listAll: () => table.toArray(),

    async create(draft, id) {
      const row = buildRow<T>(clock, draft, id);
      await table.put(row);
      return row;
    },

    update(id, changes) {
      const safeChanges = sanitizeChanges<T>(changes);
      // `load` + `put` precisam do isolamento de uma transação: sem ela, dois
      // `update`s concorrentes na mesma linha podem carregar o mesmo `current`
      // antes de qualquer um gravar, e o segundo `put` apaga o primeiro (lost
      // update). O Dexie reaproveita a transação do chamador quando já existe
      // uma (ex.: o `mutate` da sessão), então isto não aninha transação à toa.
      return table.db.transaction("rw", table, async () => {
        const current = await load(id);
        if (current.deletedAt !== null) throw new Error(`Registro ${id} foi removido`);
        if (!hasChanges(current, safeChanges)) return current;

        const next: T = { ...current, ...safeChanges, updatedAt: clock.stamp().hlc, dirty: 1 };
        await table.put(next);
        return next;
      });
    },

    remove(id) {
      return table.db.transaction("rw", table, async () => {
        const current = await load(id);
        if (current.deletedAt !== null) return current;

        const { hlc } = clock.stamp();
        const next: T = { ...current, deletedAt: hlc, updatedAt: hlc, dirty: 1 };
        await table.put(next);
        return next;
      });
    },
  };
}
