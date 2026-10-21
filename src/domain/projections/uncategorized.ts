import type { Ulid } from "../ids/ulid";
import { buildCategoryIndex, suggestCategory } from "../import/suggest-category";
import type { AppState } from "../model/app-state";
import type { Transaction } from "../model/transaction";
import { countsInTotals } from "../transactions/counts-in-totals";
import { findCategory } from "./selectors";

/**
 * Lançamentos sem categoria: `categoryId` nulo **ou** apontando para categoria
 * apagada. É a mesma regra de `findCategory` e de `categoryBreakdown` — apagar
 * não cascateia, e o "Sem categoria" do Dashboard tem de bater com esta lista.
 *
 * Recebe os registros **já filtrados** por `listTransactions`. Transferência e
 * oculto ficam de fora: não entram em relatório, então classificá-los não muda
 * número algum e só encheria a fila.
 */
export function uncategorized(items: Transaction[], state: AppState): Transaction[] {
  return items.filter(
    (item) => countsInTotals(item) && findCategory(state, item.categoryId) === null,
  );
}

/**
 * Sugestão por lançamento, pelo histórico do próprio usuário (a mesma da
 * importação de PDF). Só devolve quem tem sugestão; nada é aplicado aqui.
 */
export function suggestionsFor(items: Transaction[], state: AppState): Map<Ulid, Ulid> {
  const index = buildCategoryIndex(state);
  const found = new Map<Ulid, Ulid>();
  for (const item of items) {
    const categoryId = suggestCategory(index, item.description, item.kind);
    if (categoryId !== null) found.set(item.id, categoryId);
  }
  return found;
}
