import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { Transaction } from "../model/transaction";

export interface EstimatedTotals {
  incomeMinor: number;
  expenseMinor: number;
}

/**
 * Quanto dos registros **já filtrados** é estimativa. Os totais normais já
 * incluem esses valores (a estimativa é uma transação como outra); isto só diz
 * ao resumo quanto do número ainda é palpite.
 */
export function estimatedTotals(records: readonly Transaction[]): EstimatedTotals {
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const record of records) {
    if (record.estimated !== true) continue;
    if (record.kind === "income") incomeMinor += record.amountMinor;
    else expenseMinor += record.amountMinor;
  }
  return { incomeMinor, expenseMinor };
}

/**
 * Estimativas vivas esperando confirmação, da mais antiga para a mais nova: a
 * de agosto esquecida vem antes da de outubro, que o usuário ainda lembra.
 */
export function pendingEstimates(state: AppState): Transaction[] {
  return Object.values(state.transactions)
    .filter((row) => isAlive(row) && row.estimated === true)
    .sort((a, b) => {
      if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? -1 : 1;
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    });
}
