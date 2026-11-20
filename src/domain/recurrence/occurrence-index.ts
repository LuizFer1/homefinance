import { stableEntityIdV1 } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import { type Book, bookOf } from "../model/book";
import type { Transaction } from "../model/transaction";

type KeyFields = Pick<Transaction, "recurrenceId" | "occurrenceKey"> & { book?: unknown };

/**
 * O lugar v1 de uma chave que ainda não tem linha:
 * - `free`: ninguém lá → grava em v1, o mesmo id do app velho;
 * - `other`: a linha de lá é de outro fato (viva ou apagada) → v2, sem tocar nela.
 */
export type OccurrenceSlot = "free" | "other";

export interface OccurrenceIndex {
  /**
   * "Esta ocorrência já tem linha?" pela chave, não pelo id (spec do id
   * estável, §4.3 e a nota "Resolvido na P2-1"). Sim se:
   * 1. alguma linha, viva **ou apagada**, tem `recurrenceId === series` e
   *    `occurrenceKey === key`, em qualquer id (v1, v2 ou outro). Apagada conta:
   *    a ocorrência que o usuário removeu não volta;
   * 2. a linha no lugar v1 da chave (viva ou apagada, da mesma conta) não
   *    contradiz a chave: nenhum dos dois campos preenchido com outro valor. Sem
   *    os dois é o "ambíguo" — ocorrência gravada antes de `occurrenceKey`
   *    existir, que **é** o fato. Na dúvida conta como gravada: o custo é uma
   *    avulsa colidida engolir a ocorrência; o contrário daria salário em dobro.
   */
  knows: (series: Ulid, key: string, book: Book) => boolean;
  /** Para uma chave que `knows` não conhece: onde gravar. */
  slot: (key: string) => OccurrenceSlot;
  /**
   * Reserva o id para uma linha planejada e ainda não gravada: o próximo fato do
   * mesmo lote que cair no mesmo lugar o vê ocupado. Sem isto, duas chaves que
   * colidem num lugar livre iriam as duas para v1 — e o `insertMissing`
   * derrubaria o lote inteiro pelo id repetido.
   */
  claim: (id: Ulid, series: Ulid, key: string, book: Book) => void;
}

/** A linha no lugar v1 contradiz a chave? Igual ao hub (`knows_occurrence`). */
function contradicts(row: KeyFields, series: Ulid, key: string): boolean {
  return (
    (row.recurrenceId != null && row.recurrenceId !== series) ||
    (row.occurrenceKey != null && row.occurrenceKey !== key)
  );
}

/**
 * Índice montado uma vez por chamada (planejar, projetar, escolher competência)
 * sobre `transactions` — de preferência a tabela inteira, as duas contas.
 *
 * A linha de **outra conta** no lugar v1 é sempre outro fato: a ocorrência nasce
 * na conta da série. Isso também mantém de acordo quem lê a visão de uma conta
 * (a projeção, que não enxerga a linha da outra) e quem planeja sobre a tabela
 * inteira: os dois tratam a chave como sem linha.
 */
export function occurrenceIndex(transactions: Readonly<Record<Ulid, KeyFields>>): OccurrenceIndex {
  const keys = new Map<string, Set<Ulid>>();
  const claimed = new Map<Ulid, KeyFields>();
  const add = (key: string, series: Ulid) => {
    let set = keys.get(key);
    if (set === undefined) {
      set = new Set();
      keys.set(key, set);
    }
    set.add(series);
  };
  for (const row of Object.values(transactions)) {
    if (typeof row.recurrenceId === "string" && typeof row.occurrenceKey === "string") {
      add(row.occurrenceKey, row.recurrenceId);
    }
  }
  const atSlot = (key: string): KeyFields | undefined => {
    const id = stableEntityIdV1(key);
    return claimed.get(id) ?? transactions[id];
  };

  return {
    knows(series, key, book) {
      if (keys.get(key)?.has(series) === true) return true;
      const row = atSlot(key);
      return row !== undefined && bookOf(row) === book && !contradicts(row, series, key);
    },
    slot(key) {
      return atSlot(key) === undefined ? "free" : "other";
    },
    claim(id, series, key, book) {
      claimed.set(id, { recurrenceId: series, occurrenceKey: key, book });
      add(key, series);
    },
  };
}
