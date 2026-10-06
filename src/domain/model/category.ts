import type { Ulid } from "../ids/ulid";
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
  /**
   * Só numa lápide: a linha que substituiu esta. Cópias antigas de um padrão,
   * semeadas com id aleatório em cada aparelho, são fundidas na linha de id
   * estável, e quem ainda aponta para a cópia segue para lá. Opcional porque
   * linhas gravadas antes da fusão não têm a coluna.
   */
  mergedInto?: Ulid | null;
}

export type CategoryDraft = Draft<Category>;
