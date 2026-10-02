import type { Recurrence } from "../model/recurrence";
import type { Transaction } from "../model/transaction";
import { periodOfKey } from "./schedule";

/**
 * Quantas ocorrências confirmadas entram na média. Ocorrências e não meses do
 * calendário: numa série bimestral, seis meses seriam três pontos.
 */
export const ESTIMATE_WINDOW = 6;

/**
 * Estimativa de uma série variável na competência `period`: a média das
 * `ESTIMATE_WINDOW` ocorrências confirmadas mais recentes **antes** dela,
 * arredondada para centavo; sem nenhuma, o palpite da série (`amountMinor`).
 *
 * Só confirmadas: uma estimativa que entrasse na média se realimentaria, e o
 * número inventado viraria histórico. Só competências anteriores: a estimativa
 * de março não pode depender de abril, senão rematerializar março num aparelho
 * que já tem abril daria outro valor.
 *
 * Recebe a tabela inteira e filtra aqui dentro — série, `deletedAt` e
 * `estimated` —, como `amountFor`: quem chama passa `Object.values` cru.
 */
export function estimateFor(
  series: Pick<Recurrence, "id" | "amountMinor">,
  transactions: readonly Transaction[],
  period: string,
): number {
  const confirmed: { period: string; amountMinor: number }[] = [];
  for (const row of transactions) {
    if (row.deletedAt !== null || row.recurrenceId !== series.id) continue;
    if (row.estimated === true || row.occurrenceKey === null) continue;
    const own = periodOfKey(row.occurrenceKey);
    if (own >= period) continue;
    confirmed.push({ period: own, amountMinor: row.amountMinor });
  }
  if (confirmed.length === 0) return series.amountMinor;

  confirmed.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
  const recent = confirmed.slice(0, ESTIMATE_WINDOW);
  const sum = recent.reduce((total, row) => total + row.amountMinor, 0);
  return Math.round(sum / recent.length);
}
