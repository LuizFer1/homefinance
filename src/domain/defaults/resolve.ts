import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { Category } from "../model/category";
import type { PaymentMethod } from "../model/payment-method";

/** Mais que isso só aparece num ciclo, que nenhuma fusão produz mas o log eterno pode trazer. */
const MAX_HOPS = 8;

type Redirects = ReadonlyMap<Ulid, Ulid>;

function redirectsOf(rows: Record<Ulid, Category | PaymentMethod>): Redirects {
  const map = new Map<Ulid, Ulid>();
  for (const row of Object.values(rows)) {
    // Só lápide: `mergedInto` numa linha viva é dado inconsistente, e seguir
    // ele esconderia uma categoria que a pessoa vê na lista.
    if (row.deletedAt !== null && typeof row.mergedInto === "string") {
      map.set(row.id, row.mergedInto);
    }
  }
  return map;
}

function follow(redirects: Redirects, id: Ulid | null): Ulid | null {
  if (id === null) return null;
  let current = id;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const next = redirects.get(current);
    if (next === undefined) return current;
    current = next;
  }
  return current;
}

/** Troca só as linhas que mudaram; sem nenhuma, devolve o mesmo objeto. */
function mapRows<T>(rows: Record<Ulid, T>, fix: (row: T) => T): Record<Ulid, T> {
  let out: Record<Ulid, T> | null = null;
  for (const [id, row] of Object.entries(rows)) {
    const fixed = fix(row);
    if (fixed === row) continue;
    out ??= { ...rows };
    out[id] = fixed;
  }
  return out ?? rows;
}

/**
 * Lançamentos, séries e reservas que ainda apontam para uma cópia fundida de
 * um padrão passam a apontar para a linha que a substituiu.
 *
 * Na leitura, não no disco: regravar cada lançamento antigo seria uma escrita
 * em massa, e com LWW por linha ela podia desfazer a edição que o outro
 * aparelho fez no mesmo lançamento ao mesmo tempo. A troca vai para o disco
 * quando a pessoa salva o registro, porque o formulário parte deste estado.
 */
export function resolveMerged(state: AppState): AppState {
  const categories = redirectsOf(state.categories);
  const methods = redirectsOf(state.paymentMethods);
  if (categories.size === 0 && methods.size === 0) return state;

  const fixRef = <T extends { categoryId: Ulid | null; paymentMethodId: Ulid | null }>(
    row: T,
  ): T => {
    const categoryId = follow(categories, row.categoryId);
    const paymentMethodId = follow(methods, row.paymentMethodId);
    if (categoryId === row.categoryId && paymentMethodId === row.paymentMethodId) return row;
    return { ...row, categoryId, paymentMethodId };
  };

  const transactions = mapRows(state.transactions, fixRef);
  const recurrences = mapRows(state.recurrences, fixRef);
  const reserves = mapRows(state.reserves, (row) => {
    const ids = row.essentialCategoryIds;
    if (ids === null || !ids.some((id) => categories.has(id))) return row;
    // Cópia e estável na mesma lista viram a mesma categoria: sem o Set, ela
    // contaria duas vezes no custo essencial da reserva de emergência.
    const resolved = [...new Set(ids.map((id) => follow(categories, id) ?? id))];
    return { ...row, essentialCategoryIds: resolved };
  });

  if (
    transactions === state.transactions &&
    recurrences === state.recurrences &&
    reserves === state.reserves
  ) {
    return state;
  }
  return { ...state, transactions, recurrences, reserves };
}
