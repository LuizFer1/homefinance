import type { Ulid } from "../ids/ulid";
import type { Category } from "./category";
import type { PaymentMethod } from "./payment-method";
import type { Recurrence } from "./recurrence";
import type { Transaction } from "./transaction";
import type { User } from "./user";

/** Nome da tabela → tipo da linha. Fonte única de verdade para o resto. */
export interface RowMap {
  users: User;
  categories: Category;
  paymentMethods: PaymentMethod;
  transactions: Transaction;
  recurrences: Recurrence;
}

export type TableName = keyof RowMap;
export type RowOf<K extends TableName> = RowMap[K];

/** Espelho em memória das tabelas, inclusive linhas apagadas. */
export type AppState = { [K in TableName]: Record<Ulid, RowMap[K]> };

export type RowsByTable = { [K in TableName]?: RowMap[K][] };

/**
 * `Record<TableName, true>`, e não um array literal, porque um array não é
 * checado pelo compilador contra `RowMap`: uma tabela nova em `RowMap` sem
 * entrada aqui compilaria assim mesmo, e ficaria de fora do boot, do `mutate`
 * e do `putRows` em silêncio.
 */
const TABLES: Record<TableName, true> = {
  users: true,
  categories: true,
  paymentMethods: true,
  transactions: true,
  recurrences: true,
};

export const TABLE_NAMES: readonly TableName[] = Object.keys(TABLES) as TableName[];

/**
 * Estado vazio compartilhado por toda sessão nova. Congelado (um nível abaixo
 * inclusive) porque é uma constante do módulo: sem o freeze, uma mutação
 * direta por engano em um bucket vazaria para toda sessão que ainda não
 * gravou nada naquela tabela.
 */
export const EMPTY_APP_STATE: AppState = Object.freeze({
  users: Object.freeze({}),
  categories: Object.freeze({}),
  paymentMethods: Object.freeze({}),
  transactions: Object.freeze({}),
  recurrences: Object.freeze({}),
}) as AppState;
