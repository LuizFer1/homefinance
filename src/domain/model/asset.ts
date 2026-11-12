import type { BaseRow, Draft } from "./base";
import type { BookScoped } from "./book";

export const ASSET_KINDS = ["investment", "inventory", "equipment"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/**
 * Capital do negócio, em valor total por tipo (sem itens nem quantidades).
 * Nunca entra em receita nem despesa: é patrimônio, como os movimentos de
 * reserva.
 */
export interface Asset extends BaseRow, BookScoped {
  kind: AssetKind;
  name: string;
  /** Valor atual, inteiro na unidade menor: 1234 é R$ 12,34. */
  valueMinor: number;
  /** 'YYYY-MM-DD'. */
  acquiredOn: string;
  note?: string | null;
}

export type AssetDraft = Draft<Asset>;
