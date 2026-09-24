import type { BaseRow } from "./base";

/**
 * Colunas de `BaseRow` para fixtures de teste montadas à mão: linha viva e já
 * sincronizada. Espalhe antes dos campos da entidade. O sufixo `.fake` o
 * mantém fora do `include` do Vitest.
 */
export const ALIVE: Omit<BaseRow, "id"> = {
  createdAt: "2026-08-07T12:00:00.000Z",
  updatedAt: "1754568000000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ",
  deletedAt: null,
  dirty: 0,
};

/** HLC qualquer para marcar uma fixture como apagada (`deletedAt`). */
export const DELETED_AT = "1754568000001-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ";
