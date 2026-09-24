import type { BaseRow, Draft } from "./base";
import type { ColorToken, IconKey } from "./tokens";

/** `both` serve aos dois lados: investimento e transferência são legitimamente os dois. */
export const CATEGORY_KINDS = ["expense", "income", "both"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface Category extends BaseRow {
  name: string;
  icon: IconKey;
  color: ColorToken;
  kind: CategoryKind;
}

export type CategoryDraft = Draft<Category>;
