import type { Ulid } from "../ids/ulid";
import type { Asset } from "./asset";
import type { BookAccount } from "./book-account";
import type { Budget } from "./budget";
import type { Category } from "./category";
import type { Debt } from "./debt";
import type { PaymentMethod } from "./payment-method";
import type { Recurrence } from "./recurrence";
import type { RecurrenceAdjustment } from "./recurrence-adjustment";
import type { Reserve, ReserveMovement } from "./reserve";
import type { Transaction } from "./transaction";
import type { User } from "./user";

/** Nome da tabela → tipo da linha. Fonte única de verdade para o resto. */
export interface RowMap {
  users: User;
  categories: Category;
  paymentMethods: PaymentMethod;
  transactions: Transaction;
  recurrences: Recurrence;
  recurrenceAdjustments: RecurrenceAdjustment;
  reserves: Reserve;
  reserveMovements: ReserveMovement;
  budgets: Budget;
  books: BookAccount;
  assets: Asset;
  debts: Debt;
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
  recurrenceAdjustments: true,
  reserves: true,
  reserveMovements: true,
  budgets: true,
  books: true,
  assets: true,
  debts: true,
};

export const TABLE_NAMES: readonly TableName[] = Object.keys(TABLES) as TableName[];

/**
 * Tabelas cujas linhas pertencem a uma conta (`book`). `users` é a pessoa, e
 * `books` descreve as próprias contas: as duas valem nas duas contas e nunca
 * levam `book`. `Record`, e não uma lista, pelo mesmo motivo de `TABLES`: uma
 * tabela nova obriga a decidir se ela é de uma conta ou compartilhada.
 */
const BOOK_SCOPED: Record<TableName, boolean> = {
  users: false,
  categories: true,
  paymentMethods: true,
  transactions: true,
  recurrences: true,
  recurrenceAdjustments: true,
  reserves: true,
  reserveMovements: true,
  budgets: true,
  books: false,
  assets: true,
  debts: true,
};

export function isBookScoped(table: TableName): boolean {
  return BOOK_SCOPED[table];
}

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
  recurrenceAdjustments: Object.freeze({}),
  reserves: Object.freeze({}),
  reserveMovements: Object.freeze({}),
  budgets: Object.freeze({}),
  books: Object.freeze({}),
  assets: Object.freeze({}),
  debts: Object.freeze({}),
}) as AppState;
