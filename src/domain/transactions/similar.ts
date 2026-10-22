import type { Ulid } from "../ids/ulid";
import { normalizeDescription } from "../import/suggest-category";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { Transaction, TransactionKind } from "../model/transaction";

export interface SimilarQuery {
  /** O lançamento que acabou de ser reclassificado: nunca aparece na lista. */
  sourceId: Ulid;
  description: string;
  kind: TransactionKind;
  /** Categoria nova: quem já está nela não precisa mudar. */
  categoryId: Ulid;
}

/**
 * Lançamentos "da mesma loja": mesma descrição normalizada **sem número** e mesmo
 * tipo. É a mesma chave do índice de sugestão — caixa, acento, pontuação e número
 * de loja não separam "Uber Trip 123" de "UBER TRIP 456". Descrição só de números
 * normaliza para vazio e não casa com nada: sem chave, tudo pareceria igual.
 *
 * Só a descrição inteira conta (a primeira palavra serve para sugerir, não para
 * reescrever o histórico em lote). Mais recentes primeiro.
 */
export function findSimilar(state: AppState, query: SimilarQuery): Transaction[] {
  const key = normalizeDescription(query.description, false);
  if (key === "") return [];
  return Object.values(state.transactions)
    .filter(
      (row) =>
        isAlive(row) &&
        row.id !== query.sourceId &&
        row.kind === query.kind &&
        row.categoryId !== query.categoryId &&
        normalizeDescription(row.description, false) === key,
    )
    .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0));
}
