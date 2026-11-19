import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { Transaction } from "../model/transaction";
import { countsInTotals } from "../transactions/counts-in-totals";
import { filterByMonth } from "./breakdown";

export interface FixedVariable {
  /** Despesa de recorrência viva de valor fixo (inclui parcelas). */
  fixedMinor: number;
  /** O resto: avulsos e recorrências "valor varia". */
  variableMinor: number;
}

/**
 * "R$ 876 fixos · R$ 2.237 variáveis" do mês (indicadores §6.6). É o variável que
 * dá para mexer esta semana; saber quanto ele é muda onde se põe o esforço.
 *
 * Fixa = lançamento de série **viva** sem `variable: true` — inclusive série pausada
 * e série de app antigo, que só tem `frequency` (spec do hub 4.7; o hub segue a mesma
 * regra). Série apagada ou que ainda não chegou por sync conta como variável:
 * degrada sem quebrar, e não há como saber se ela era fixa.
 */
export function fixedVariable(items: Transaction[], state: AppState, month: string): FixedVariable {
  let fixedMinor = 0;
  let variableMinor = 0;

  for (const item of filterByMonth(items, month)) {
    if (item.kind !== "expense" || !countsInTotals(item)) continue;
    const series = item.recurrenceId === null ? undefined : state.recurrences[item.recurrenceId];
    if (series !== undefined && isAlive(series) && series.variable !== true) {
      fixedMinor += item.amountMinor;
    } else {
      variableMinor += item.amountMinor;
    }
  }

  return { fixedMinor, variableMinor };
}
