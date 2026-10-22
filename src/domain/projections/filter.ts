import type { Ulid } from "../ids/ulid";
import { normalizeDescription } from "../import/suggest-category";
import type { AppState } from "../model/app-state";
import type { Transaction, TransactionKind } from "../model/transaction";
import { findCategory } from "./selectors";

/** "Sem categoria" / "Sem forma de pagamento" como valor de filtro. */
export const NONE = "none" as const;

export interface TransactionFilters {
  /** Trecho da descrição; sem acento, caixa nem pontuação. */
  query: string;
  kind: TransactionKind | null;
  /** Id de categoria, `NONE` (sem categoria, inclusive a apagada) ou `null` (todas). */
  categoryId: Ulid | typeof NONE | null;
  paymentMethodId: Ulid | typeof NONE | null;
  userId: Ulid | null;
}

export const NO_FILTERS: TransactionFilters = {
  query: "",
  kind: null,
  categoryId: null,
  paymentMethodId: null,
  userId: null,
};

export function hasFilters(filters: TransactionFilters): boolean {
  return (
    normalizeDescription(filters.query) !== "" ||
    filters.kind !== null ||
    filters.categoryId !== null ||
    filters.paymentMethodId !== null ||
    filters.userId !== null
  );
}

/**
 * Recorta os registros **já filtrados** por `listTransactions`, mantendo a ordem.
 *
 * Os filtros se combinam em "e". "Sem categoria" usa a mesma regra de
 * `findCategory` do resto do app: lançamento cuja categoria foi apagada também
 * é "sem categoria" — apagar não cascateia, e o usuário não vê a diferença.
 * Lançamento marcado como transferência ou oculto continua listável: o recorte
 * muda o que aparece, não o que conta (isso é de `totals`).
 */
export function filterTransactions(
  items: Transaction[],
  filters: TransactionFilters,
  state: AppState,
): Transaction[] {
  const query = normalizeDescription(filters.query);

  return items.filter((item) => {
    if (query !== "" && !normalizeDescription(item.description).includes(query)) return false;
    if (filters.kind !== null && item.kind !== filters.kind) return false;

    if (filters.categoryId === NONE) {
      if (findCategory(state, item.categoryId) !== null) return false;
    } else if (filters.categoryId !== null && item.categoryId !== filters.categoryId) {
      return false;
    }

    if (filters.paymentMethodId === NONE) {
      if (item.paymentMethodId !== null) return false;
    } else if (
      filters.paymentMethodId !== null &&
      item.paymentMethodId !== filters.paymentMethodId
    ) {
      return false;
    }

    if (filters.userId !== null && item.userId !== filters.userId) return false;
    return true;
  });
}
