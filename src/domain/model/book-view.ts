import type { Ulid } from "../ids/ulid";
import { type AppState, isBookScoped, TABLE_NAMES, type TableName } from "./app-state";
import type { BaseRow } from "./base";
import { type Book, type BookScoped, bookOf } from "./book";

type Bucket = Record<Ulid, BaseRow & BookScoped>;

/** Só as linhas de `book` numa tabela; sem nenhuma de fora, devolve o mesmo objeto. */
function filterBucket(bucket: Bucket, book: Book): Bucket {
  const entries = Object.entries(bucket);
  // Quem só tem a conta pessoal (o caso comum) não paga alocação nem perde a
  // identidade do objeto.
  if (entries.every(([, row]) => bookOf(row) === book)) return bucket;
  return Object.fromEntries(entries.filter(([, row]) => bookOf(row) === book));
}

/** Ids de categoria e de forma de pagamento que existem, mas em **outra** conta. */
interface ForeignIds {
  categories: ReadonlySet<Ulid>;
  paymentMethods: ReadonlySet<Ulid>;
}

function foreignIdsOf(bucket: Bucket, book: Book): ReadonlySet<Ulid> {
  const ids = new Set<Ulid>();
  for (const [id, row] of Object.entries(bucket)) {
    if (bookOf(row) !== book) ids.add(id);
  }
  return ids;
}

type Refs = { categoryId?: Ulid | null; paymentMethodId?: Ulid | null };

/**
 * Zera, nas linhas de uma tabela, a referência que aponta para uma linha de outra
 * conta. É isto que faz "referência entre contas" aparecer como **Sem categoria** e
 * não como "Categoria removida": na visão filtrada o destino some, e quem lê não
 * distinguiria "é da outra conta" de "foi apagado". Só aqui se sabe a diferença.
 *
 * Só na leitura (como `resolveMerged`): o disco guarda a referência como veio.
 * Sem nenhuma referência cruzada, devolve o mesmo objeto.
 */
function dropForeignRefs(bucket: Bucket, foreign: ForeignIds): Bucket {
  if (foreign.categories.size === 0 && foreign.paymentMethods.size === 0) return bucket;
  let out: Bucket | null = null;
  for (const [id, row] of Object.entries(bucket)) {
    const refs = row as Refs;
    const category = refs.categoryId;
    const method = refs.paymentMethodId;
    const dropCategory = typeof category === "string" && foreign.categories.has(category);
    const dropMethod = typeof method === "string" && foreign.paymentMethods.has(method);
    if (!dropCategory && !dropMethod) continue;
    out ??= { ...bucket };
    out[id] = {
      ...row,
      ...(dropCategory ? { categoryId: null } : {}),
      ...(dropMethod ? { paymentMethodId: null } : {}),
    };
  }
  return out ?? bucket;
}

/** A reserva de emergência lista categorias essenciais: as de outra conta saem da lista. */
function dropForeignEssentials(bucket: Bucket, foreign: ForeignIds): Bucket {
  if (foreign.categories.size === 0) return bucket;
  let out: Bucket | null = null;
  for (const [id, row] of Object.entries(bucket)) {
    const ids = (row as { essentialCategoryIds?: Ulid[] | null }).essentialCategoryIds;
    if (!Array.isArray(ids) || !ids.some((ref) => foreign.categories.has(ref))) continue;
    out ??= { ...bucket };
    out[id] = {
      ...row,
      essentialCategoryIds: ids.filter((ref) => !foreign.categories.has(ref)),
    } as Bucket[string];
  }
  return out ?? bucket;
}

/** Tabelas cujas linhas guardam referência a categoria ou forma de pagamento. */
const REF_FIXES: Partial<Record<TableName, (bucket: Bucket, foreign: ForeignIds) => Bucket>> = {
  transactions: dropForeignRefs,
  recurrences: dropForeignRefs,
  reserves: dropForeignEssentials,
};

/**
 * A visão de uma conta sobre o estado completo: as tabelas por conta só com as
 * linhas daquele `book`, e `users` e `books` inteiras. Pura: telas, stores e
 * projeções leem esta visão sem saber que existe filtro.
 *
 * Uma referência que cruza contas (`categoryId` de uma conta apontando para
 * linha da outra) não acha o destino aqui, e é zerada na própria linha da visão:
 * cai em "Sem categoria" em todo lugar (lista, filtro, contador), distinta da
 * categoria que foi **apagada** ("Categoria removida"). Nada cascateia no disco.
 */
export function stateForBook(full: AppState, book: Book): AppState {
  const foreign: ForeignIds = {
    categories: foreignIdsOf(full.categories as Bucket, book),
    paymentMethods: foreignIdsOf(full.paymentMethods as Bucket, book),
  };
  const view: Record<string, Bucket> = {};
  for (const table of TABLE_NAMES) {
    const bucket = full[table] as Bucket;
    const filtered = isBookScoped(table) ? filterBucket(bucket, book) : bucket;
    view[table] = REF_FIXES[table]?.(filtered, foreign) ?? filtered;
  }
  return view as unknown as AppState;
}

/**
 * Como `stateForBook`, lembrando o resultado por tabela: se os objetos de que a
 * tabela depende no estado completo e a conta são os mesmos da chamada anterior,
 * devolve a mesma tabela filtrada. Uma escrita mexe numa tabela e as outras seguem
 * com a identidade de antes, o que evita refiltrar (e re-renderizar) o que não mudou.
 *
 * As tabelas com referência (`REF_FIXES`) dependem também de `categories` e
 * `paymentMethods`: criar uma categoria numa conta muda quais ids são "de fora".
 */
export function createBookView(): (full: AppState, book: Book) => AppState {
  const lastIn = new Map<TableName, readonly unknown[]>();
  const lastOut = new Map<TableName, Bucket>();
  let foreignKey: readonly unknown[] = [];
  let foreign: ForeignIds | null = null;

  const same = (a: readonly unknown[] | undefined, b: readonly unknown[]) =>
    a !== undefined && a.length === b.length && a.every((item, index) => item === b[index]);

  return (full, book) => {
    const key = [full.categories, full.paymentMethods, book];
    if (foreign === null || !same(foreignKey, key)) {
      foreign = {
        categories: foreignIdsOf(full.categories as Bucket, book),
        paymentMethods: foreignIdsOf(full.paymentMethods as Bucket, book),
      };
      foreignKey = key;
    }
    const view: Record<string, Bucket> = {};
    for (const table of TABLE_NAMES) {
      const bucket = full[table] as Bucket;
      const fix = REF_FIXES[table];
      const deps = fix === undefined ? [bucket, book] : [bucket, book, ...key];
      const cached = lastOut.get(table);
      if (cached !== undefined && same(lastIn.get(table), deps)) {
        view[table] = cached;
        continue;
      }
      const filtered = isBookScoped(table) ? filterBucket(bucket, book) : bucket;
      const out = fix === undefined ? filtered : fix(filtered, foreign);
      lastIn.set(table, deps);
      lastOut.set(table, out);
      view[table] = out;
    }
    return view as unknown as AppState;
  };
}
