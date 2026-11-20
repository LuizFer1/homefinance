import type { AppState } from "../model/app-state";
import type { ReserveMovement } from "../model/reserve";
import type { Transaction } from "../model/transaction";
import { depositSeed, isDepositFor } from "../reserves/deposits";
import { stableEntityIdV1, stableEntityIdV2 } from "./stable-id";

export interface OccurrenceRepair {
  /** A cópia v2(K): vira tombstone. */
  loser: Transaction;
  /**
   * A v1(K) como foi lida. Entra nas versões esperadas mesmo sem ser regravada:
   * se outra aba ou o sync a apagou nesse meio-tempo, apagar a v2 deixaria zero.
   */
  keeper: Transaction;
  /**
   * A v1(K) com a confirmação da v2 copiada, ou `null` quando ela fica como está.
   * Só existe quando a v2 está confirmada e a v1 ainda é estimativa.
   */
  survivor: Transaction | null;
}

export interface DuplicateRepairPlan {
  /**
   * Ocorrências `{v1(K), v2(K)}` e avulsas importadas com a mesma `importKey`
   * v2 (a cópia no id da chave perde; nas avulsas `survivor` é sempre `null`).
   */
  transactions: OccurrenceRepair[];
  /** Cópias v2 de depósito mensal (`loser`, vira tombstone) e a v1 que fica (`keeper`). */
  reserveMovements: { loser: ReserveMovement; keeper: ReserveMovement }[];
}

/**
 * Duplicatas do cenário C (spec do id estável, §4.5): o aparelho A viu o lugar
 * v1(K) ocupado por outro fato e gravou K em v2(K); o B, sem ver esse outro
 * fato, gravou K em v1(K). Depois do sync há dois K vivos.
 *
 * Apaga sozinho, então o escopo é o mais estreito possível: só o par **vivo**
 * nos ids exatos `{v1(K), v2(K)}` da mesma semente e do mesmo fato (os dois
 * campos da chave iguais nas duas linhas; uma linha ambígua no lugar nunca faz
 * par). A mesma chave em outros ids não veio deste caminho e não é tocada;
 * tombstones ficam fora (apagar é decisão do usuário, e uma viva nunca mata uma
 * apagada).
 *
 * Vencedora **só pelos ids**: sobrevive a v1, a v2 vira tombstone. Campos que
 * mudam (confirmação, `updatedAt`) dariam vencedoras diferentes a aparelhos em
 * estados diferentes; cada um apagaria uma metade e, depois do sync, as duas
 * estariam apagadas. Pelo id, todos apagam a mesma. E a v1 é a que o app velho
 * enxerga.
 *
 * A confirmação feita só na v2 não se perde: é copiada para a v1. Outras edições
 * à mão feitas só na v2 (descrição, categoria) se perdem — a v2 só existe na
 * janela entre o cenário C e o próximo reparo.
 *
 * Barato no caso comum: o v1 (FNV) é calculado por linha com chave, e o SHA-256
 * da v2 só quando há uma parceira viva no lugar v1.
 */
export function planDuplicateRepair(state: AppState): DuplicateRepairPlan {
  const transactions: OccurrenceRepair[] = [];
  for (const row of Object.values(state.transactions)) {
    if (row.deletedAt !== null) continue;
    const series = row.recurrenceId;
    const key = row.occurrenceKey;
    if (typeof series !== "string" || typeof key !== "string") continue;
    const v1 = stableEntityIdV1(key);
    if (v1 === row.id) continue;
    const partner = state.transactions[v1];
    if (partner === undefined || partner.deletedAt !== null) continue;
    if (partner.recurrenceId !== series || partner.occurrenceKey !== key) continue;
    if (stableEntityIdV2(key) !== row.id) continue;
    const confirmedOnlyHere = row.estimated !== true && partner.estimated === true;
    transactions.push({
      loser: row,
      keeper: partner,
      survivor: confirmedOnlyHere
        ? {
            ...partner,
            amountMinor: row.amountMinor,
            occurredOn: row.occurredOn,
            estimated: false,
            importKey: row.importKey ?? null,
          }
        : null,
    });
  }

  // Avulsa importada (achado 8 da revisão): dois aparelhos novos importam a mesma
  // linha, um com o lugar v1 livre (grava lá) e o outro ocupado (grava em v2); as
  // duas levam `importKey = v2(semente)`, que prova o mesmo fato. A linha não
  // guarda a semente, mas a avulsa só leva a própria v2 como chave quando está
  // nela: `id === importKey` é a cópia v2. Mesma regra só pelos ids — sobrevive a
  // outra. Só avulsa (`occurrenceKey === null`): a ocorrência que a linha
  // confirmou leva a mesma chave e é outro fato.
  const importedByKey = new Map<string, Transaction[]>();
  for (const row of Object.values(state.transactions)) {
    if (row.deletedAt !== null || row.occurrenceKey != null) continue;
    if (typeof row.importKey !== "string" || row.importKey === row.id) continue;
    const list = importedByKey.get(row.importKey) ?? [];
    list.push(row);
    importedByKey.set(row.importKey, list);
  }
  for (const [key, partners] of importedByKey) {
    const loser = state.transactions[key];
    if (loser === undefined || loser.deletedAt !== null || loser.occurrenceKey != null) continue;
    if (loser.importKey !== key) continue;
    const [keeper] = [...partners].sort((a, b) => (a.id < b.id ? -1 : 1));
    if (keeper === undefined) continue;
    transactions.push({ loser, keeper, survivor: null });
  }

  const reserveMovements: DuplicateRepairPlan["reserveMovements"] = [];
  for (const row of Object.values(state.reserveMovements)) {
    if (row.deletedAt !== null || row.recurring !== true) continue;
    // Só linha nova vai para v2, e linha nova sempre grava `period`.
    const month = row.period;
    if (typeof month !== "string") continue;
    const seed = depositSeed(row.reserveId, month);
    const v1 = stableEntityIdV1(seed);
    if (v1 === row.id) continue;
    const partner = state.reserveMovements[v1];
    if (partner === undefined || partner.deletedAt !== null) continue;
    if (!isDepositFor(partner, row.reserveId, month)) continue;
    if (stableEntityIdV2(seed) !== row.id) continue;
    reserveMovements.push({ loser: row, keeper: partner });
  }

  return { transactions, reserveMovements };
}
