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

/**
 * A visão de uma conta sobre o estado completo: as tabelas por conta só com as
 * linhas daquele `book`, e `users` e `books` inteiras. Pura: telas, stores e
 * projeções leem esta visão sem saber que existe filtro.
 *
 * Uma referência que cruza contas (`categoryId` de uma conta apontando para
 * linha da outra) não acha o destino aqui e cai em "Sem categoria", como
 * qualquer referência órfã. Nada cascateia.
 */
export function stateForBook(full: AppState, book: Book): AppState {
  const view: Record<string, Bucket> = {};
  for (const table of TABLE_NAMES) {
    const bucket = full[table] as Bucket;
    view[table] = isBookScoped(table) ? filterBucket(bucket, book) : bucket;
  }
  return view as unknown as AppState;
}

/**
 * Como `stateForBook`, lembrando o resultado por tabela: se o objeto da tabela
 * no estado completo e a conta são os mesmos da chamada anterior, devolve a
 * mesma tabela filtrada. Uma escrita mexe numa tabela e as outras seguem com a
 * identidade de antes, o que evita refiltrar (e re-renderizar) o que não mudou.
 */
export function createBookView(): (full: AppState, book: Book) => AppState {
  let lastBook: Book | null = null;
  const lastIn = new Map<TableName, Bucket>();
  const lastOut = new Map<TableName, Bucket>();
  return (full, book) => {
    const view: Record<string, Bucket> = {};
    for (const table of TABLE_NAMES) {
      const bucket = full[table] as Bucket;
      const cached = lastOut.get(table);
      if (cached !== undefined && lastIn.get(table) === bucket && lastBook === book) {
        view[table] = cached;
        continue;
      }
      const filtered = isBookScoped(table) ? filterBucket(bucket, book) : bucket;
      lastIn.set(table, bucket);
      lastOut.set(table, filtered);
      view[table] = filtered;
    }
    lastBook = book;
    return view as unknown as AppState;
  };
}
