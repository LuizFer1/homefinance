import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { type Book, bookOf } from "../model/book";
import { stateForBook } from "../model/book-view";
import { occurrenceIndex } from "./occurrence-index";
import { type LostOccurrence, lostOccurrences } from "./plan";
import { periodOfKey } from "./schedule";

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
  return [
    ...lostOccurrences(stateForBook(full, book), today, occurrenceIndex(full.transactions)),
    ...mergedOrphans(full, book),
  ];
}

/**
 * Ocorrências que o reparo de duplicatas e uma exclusão da v1 apagaram juntos
 * (achado 4 da revisão do id estável): o reparo apagou a cópia v2 (`mergedInto`
 * = a v1) e, sem saber disso, alguém apagou a v1 — tipicamente um aparelho velho,
 * que ainda via as duas cópias e tirou "a duplicata". A chave ficou sem linha
 * viva.
 *
 * Não dá para saber, pelas linhas, se a exclusão da v1 foi da duplicata (a
 * pessoa queria uma viva) ou do lançamento (queria zero): o aparelho velho não
 * grava o que via, e o carimbo do reparo é ancorado na versão lida, não no
 * relógio. Então nada é revivido sozinho — a folha pergunta, como nas perdas da
 * colisão. Recriar revive a v2; Não recriar limpa `mergedInto` (a v2 vira uma
 * exclusão comum e ninguém pergunta de novo).
 *
 * Só com a série viva (série apagada não pergunta sobre os meses dela) e sem
 * nenhuma linha viva da chave em qualquer id. Qualquer mês: o reparo roda também
 * no mês corrente.
 */
export function mergedOrphans(full: AppState, book: Book): LostOccurrence[] {
  const live = new Set<string>();
  for (const row of Object.values(full.transactions)) {
    if (row.deletedAt === null && typeof row.occurrenceKey === "string") {
      live.add(`${row.recurrenceId}|${row.occurrenceKey}`);
    }
  }
  const out: LostOccurrence[] = [];
  const rows = Object.values(full.transactions).sort((a, b) =>
    a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : a.id < b.id ? -1 : 1,
  );
  for (const row of rows) {
    if (row.deletedAt === null || typeof row.mergedInto !== "string") continue;
    const seriesId = row.recurrenceId;
    const key = row.occurrenceKey;
    if (typeof seriesId !== "string" || typeof key !== "string" || bookOf(row) !== book) continue;
    const keeper = full.transactions[row.mergedInto];
    if (keeper === undefined || keeper.deletedAt === null) continue;
    if (keeper.recurrenceId !== seriesId || keeper.occurrenceKey !== key) continue;
    if (live.has(`${seriesId}|${key}`)) continue;
    const series = full.recurrences[seriesId];
    if (series === undefined || series.deletedAt !== null) continue;
    const {
      id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      deletedAt: _deletedAt,
      dirty: _dirty,
      book: _book,
      userId,
      mergedInto: _mergedInto,
      ...draft
    } = row;
    out.push({
      entityId: id,
      draft,
      anchored: row.estimated === true,
      book: bookOf(row),
      userId,
      series,
      period: periodOfKey(key),
      merged: { tombstone: row, keeper },
    });
  }
  return out;
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
