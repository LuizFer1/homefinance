import { compareHlc } from "../clock/hlc";
import type { BaseRow } from "../model/base";
import { stableEntityIdV1, stableEntityIdV2 } from "./stable-id";
import type { Ulid } from "./ulid";

/**
 * Onde gravar um fato derivado que **ainda não tem linha** (spec do id estável,
 * §4.2). Quem chama já procurou o fato pela chave, em vivas e apagadas
 * (`rowForKey`); isto só decide o id.
 *
 * - lugar v1 livre → v1: o mesmo id que o app velho grava, e aparelhos velhos e
 *   novos concordam em tudo o que não colidiu;
 * - lugar v1 com qualquer linha → v2. A linha de lá é de outro fato (a busca
 *   pela chave não a achou), viva ou apagada: gravar por cima reescreveria o
 *   fato de outra série/categoria, ou reviveria o tombstone com outro conteúdo, e
 *   o LWW espalharia isso. O app velho continua achando o lugar ocupado.
 *
 * Fato cuja linha no lugar não dá para classificar (ocorrência antiga sem chave,
 * Fase 2) decide "não cria" antes de chamar isto.
 */
export function pickStableId(table: Readonly<Record<Ulid, unknown>>, seed: string): Ulid {
  const v1 = stableEntityIdV1(seed);
  return table[v1] === undefined ? v1 : stableEntityIdV2(seed);
}

type Versioned = Pick<BaseRow, "id" | "updatedAt">;

/**
 * Regra R entre duas linhas do mesmo fato: `updatedAt` maior (a última edição é
 * a intenção do usuário); empate → id maior, para o resultado não depender da
 * ordem de iteração. A mesma do hub (`amount_for`, `current_budgets`).
 */
export function newerByRuleR(row: Versioned, than: Versioned): boolean {
  const byVersion = compareHlc(row.updatedAt, than.updatedAt);
  return byVersion !== 0 ? byVersion > 0 : row.id > than.id;
}

/**
 * A linha que um escritor edita entre as que têm a mesma chave: a vencedora da
 * regra R entre as vivas — a mesma que os leitores mostram, então a edição cai
 * no que a pessoa vê —; sem viva, a apagada mais nova, que refazer revive (é o
 * mesmo fato, e outra linha seria uma duplicata da chave).
 */
export function rowForKey<T extends Pick<BaseRow, "id" | "updatedAt" | "deletedAt">>(
  rows: Iterable<T>,
): T | null {
  let alive: T | null = null;
  let deleted: T | null = null;
  for (const row of rows) {
    if (row.deletedAt === null) {
      if (alive === null || newerByRuleR(row, alive)) alive = row;
    } else if (deleted === null || newerByRuleR(row, deleted)) {
      deleted = row;
    }
  }
  return alive ?? deleted;
}
