import type { ProjectionState, TransactionRecord } from "./apply";

export interface Totals {
  incomeMinor: number;
  expenseMinor: number;
  balanceMinor: number;
}

/** Visíveis: materializados e não apagados, mais recentes primeiro. */
export function listTransactions(state: ProjectionState): TransactionRecord[] {
  return Object.values(state.transactions)
    .filter((record) => record.materialized && !record.deleted)
    .sort((a, b) => {
      if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
      // Desempate por id, para a ordem não depender da inserção no objeto.
      if (a.id === b.id) return 0;
      return a.id < b.id ? 1 : -1;
    });
}

/**
 * Soma os registros **já filtrados** por `listTransactions`.
 *
 * Não filtra tombstone nem registro-casca: chamar isto com
 * `Object.values(state.transactions)` cru soma lançamentos apagados em silêncio.
 * `balanceMinor` negativo é normal — significa mais despesa que receita.
 */
export function totals(records: TransactionRecord[]): Totals {
  let incomeMinor = 0;
  let expenseMinor = 0;

  for (const record of records) {
    if (record.kind === "income") incomeMinor += record.amountMinor;
    else expenseMinor += record.amountMinor;
  }

  return { incomeMinor, expenseMinor, balanceMinor: incomeMinor - expenseMinor };
}
