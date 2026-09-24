import type { TransactionRecord } from "./apply";
import { monthOf } from "./periods";

export interface MonthTotals {
  /** 'YYYY-MM'. */
  month: string;
  incomeMinor: number;
  expenseMinor: number;
}

export function filterByMonth(records: TransactionRecord[], month: string): TransactionRecord[] {
  return records.filter((record) => monthOf(record.occurredOn) === month);
}

/**
 * Receita e despesa por mês, uma entrada para cada mês pedido.
 *
 * Os baldes nascem zerados a partir de `months`, e não dos registros: é isso que
 * garante que um mês sem lançamento continue ocupando a posição dele no eixo.
 *
 * Pré-condição: `months` não tem repetição. Com mês repetido os baldes
 * colapsam e a saída fica menor que a entrada — hoje a única origem é
 * `lastMonths`, que nunca repete.
 */
export function monthlyTotals(records: TransactionRecord[], months: string[]): MonthTotals[] {
  const buckets = new Map<string, MonthTotals>();
  for (const month of months) {
    buckets.set(month, { month, incomeMinor: 0, expenseMinor: 0 });
  }

  for (const record of records) {
    const entry = buckets.get(monthOf(record.occurredOn));
    // Fora da janela pedida. Não é erro: o log guarda tudo, a janela é da tela.
    if (entry === undefined) continue;
    if (record.kind === "income") entry.incomeMinor += record.amountMinor;
    else entry.expenseMinor += record.amountMinor;
  }

  // O Map preserva a ordem de inserção, que é a ordem de `months`.
  return [...buckets.values()];
}
