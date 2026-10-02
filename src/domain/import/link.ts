import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { TransactionKind } from "../model/transaction";
import { pendingEstimates } from "../projections/estimates";

/** O que `suggestLinks` lê de cada linha da revisão. */
export interface LinkCandidate {
  date: string;
  kind: TransactionKind;
  categoryId: Ulid | null;
  /** Desmarcada, já importada ou parcela: não sugere nada. */
  eligible: boolean;
}

/**
 * Para cada linha do PDF, a estimativa pendente que ela provavelmente confirma:
 * mesmo tipo, mesma categoria (sugerida) e mesmo mês do calendário — e só se
 * houver **exatamente uma** candidata. Luz e água na mesma categoria "Casa"
 * dão duas candidatas, e chutar uma delas confirmaria a conta errada em
 * silêncio; sem sugestão, o usuário escolhe no seletor.
 *
 * Não casa por valor: o valor é justamente o que varia. Uma estimativa já
 * sugerida para uma linha sai da disputa das seguintes, para duas linhas não
 * confirmarem a mesma ocorrência.
 */
export function suggestLinks(state: AppState, rows: readonly LinkCandidate[]): (Ulid | null)[] {
  const pending = pendingEstimates(state);
  const taken = new Set<Ulid>();

  return rows.map((row) => {
    if (!row.eligible || row.categoryId === null) return null;
    const month = row.date.slice(0, 7);
    const matches = pending.filter(
      (estimate) =>
        !taken.has(estimate.id) &&
        estimate.kind === row.kind &&
        estimate.categoryId === row.categoryId &&
        estimate.occurredOn.slice(0, 7) === month,
    );
    const [only] = matches;
    if (matches.length !== 1 || only === undefined) return null;
    taken.add(only.id);
    return only.id;
  });
}

/**
 * Ids de linha de PDF que já confirmaram alguma ocorrência. A revisão os trata
 * como "Já importado", do mesmo jeito que um id que já existe como transação.
 */
export function confirmedImportKeys(state: AppState): Set<string> {
  const keys = new Set<string>();
  for (const row of Object.values(state.transactions)) {
    if (row.importKey != null) keys.add(row.importKey);
  }
  return keys;
}
