import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { Book } from "../model/book";
import { stateForBook } from "../model/book-view";
import { occurrenceIndex } from "./occurrence-index";
import { type LostOccurrence, lostOccurrences } from "./plan";

/**
 * Ocorrências que a colisão do id v1 engoliu, na conta `book` (spec do id
 * estável, §6): mês passado, sem linha pela chave, lugar v1 de outro fato.
 *
 * O lugar é visto na tabela inteira (`full`), como na materialização: a mesma
 * resposta nos dois caminhos. Só a folha de recuperação grava estas, e só depois
 * de perguntar — recriá-las sozinho mudaria meses fechados e dobraria o que a
 * pessoa lançou à mão.
 */
export function recoveryCandidates(full: AppState, book: Book, today: string): LostOccurrence[] {
  return lostOccurrences(stateForBook(full, book), today, occurrenceIndex(full.transactions));
}

export interface LostGroup {
  seriesId: Ulid;
  description: string;
  items: LostOccurrence[];
}

/** Por série (na ordem em que aparecem), cada uma com as competências em ordem de data. */
export function groupBySeries(lost: readonly LostOccurrence[]): LostGroup[] {
  const groups = new Map<Ulid, LostGroup>();
  for (const item of lost) {
    let group = groups.get(item.series.id);
    if (group === undefined) {
      group = { seriesId: item.series.id, description: item.series.description, items: [] };
      groups.set(item.series.id, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
