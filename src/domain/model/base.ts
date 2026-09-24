import type { Ulid } from "../ids/ulid";

/**
 * Colunas que toda tabela tem. São elas que o sync com o hub vai usar:
 * `updatedAt` decide o LWW por linha, `deletedAt` propaga a exclusão e `dirty`
 * (indexado) diz o que ainda não foi enviado.
 *
 * `dirty` é `0 | 1` e não boolean porque o IndexedDB não indexa boolean.
 */
export interface BaseRow {
  id: Ulid;
  /** ISO 8601 do aparelho. Só para leitura humana; nunca decide conflito. */
  createdAt: string;
  /** HLC. Um relógio de parede adiantado não pode vencer todo conflito. */
  updatedAt: string;
  /** HLC da exclusão, ou null. A linha nunca sai da tabela. */
  deletedAt: string | null;
  dirty: 0 | 1;
}

export type Draft<T extends BaseRow> = Omit<T, keyof BaseRow>;

export function isAlive<T extends BaseRow>(row: T | undefined): row is T {
  return row !== undefined && row.deletedAt === null;
}
