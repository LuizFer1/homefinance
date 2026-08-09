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
      return a.id < b.id ? 1 : -1;
    });
}

export function totals(records: TransactionRecord[]): Totals {
  let incomeMinor = 0;
  let expenseMinor = 0;

  for (const record of records) {
    if (record.kind === "income") incomeMinor += record.amountMinor;
    else expenseMinor += record.amountMinor;
  }

  return { incomeMinor, expenseMinor, balanceMinor: incomeMinor - expenseMinor };
}
