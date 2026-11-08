import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import type { Transaction } from "../model/transaction";

/**
 * Autor da ocorrência mais antiga (por `occurredOn`, desempate pelo id) de cada
 * série, contando as apagadas: a linha apagada continua guardando quem a criou.
 *
 * É a melhor pista do autor de uma série anterior à coluna `userId`: ao criar a
 * série, o aparelho de quem criou materializa a 1ª ocorrência na hora e a envia
 * junto com a série, então ela carrega o autor certo. Os meses seguintes é que
 * podiam nascer no telefone de outra pessoa.
 */
export function earliestOccurrenceAuthors(transactions: Iterable<Transaction>): Map<Ulid, Ulid> {
  const best = new Map<Ulid, Transaction>();
  for (const row of transactions) {
    if (row.recurrenceId === null || row.userId === null) continue;
    const current = best.get(row.recurrenceId);
    if (
      current === undefined ||
      row.occurredOn < current.occurredOn ||
      (row.occurredOn === current.occurredOn && row.id < current.id)
    ) {
      best.set(row.recurrenceId, row);
    }
  }
  const authors = new Map<Ulid, Ulid>();
  for (const [seriesId, row] of best) {
    if (row.userId !== null) authors.set(seriesId, row.userId);
  }
  return authors;
}

/** Autor gravado na série ou, nas antigas, o deduzido. `null`: não há como saber. */
export function seriesAuthor(
  series: Pick<Recurrence, "id" | "userId">,
  earliest: ReadonlyMap<Ulid, Ulid>,
): Ulid | null {
  return series.userId ?? earliest.get(series.id) ?? null;
}

export interface AuthorRepair {
  /** Séries vivas sem `userId` cujo autor foi deduzido. */
  recurrences: { row: Recurrence; userId: Ulid }[];
  /** Ocorrências (vivas ou apagadas) com autor diferente do da série. */
  transactions: { row: Transaction; userId: Ulid }[];
}

/**
 * O que corrigir para que toda ocorrência tenha o autor da sua série. Puro e
 * idempotente: com tudo certo, o plano sai vazio.
 *
 * É a única exceção a "autor nunca é reescrito", e só move o autor de uma
 * ocorrência **para o da série dela** — o defeito que corrige é justamente o
 * da materialização que carimbava o usuário do aparelho.
 */
export function planAuthorRepair(state: AppState): AuthorRepair {
  const transactions = Object.values(state.transactions);
  const earliest = earliestOccurrenceAuthors(transactions);
  const repair: AuthorRepair = { recurrences: [], transactions: [] };
  const authorOf = new Map<Ulid, Ulid>();

  for (const series of Object.values(state.recurrences)) {
    const author = seriesAuthor(series, earliest);
    if (author === null) continue;
    authorOf.set(series.id, author);
    if (series.userId == null && series.deletedAt === null) {
      repair.recurrences.push({ row: series, userId: author });
    }
  }

  for (const row of transactions) {
    if (row.recurrenceId === null) continue;
    const author = authorOf.get(row.recurrenceId);
    if (author !== undefined && row.userId !== author) {
      repair.transactions.push({ row, userId: author });
    }
  }

  return repair;
}
