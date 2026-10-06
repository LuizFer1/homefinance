import type { Ulid } from "../ids/ulid";
import type { BaseRow, Draft } from "./base";
import type { ColorToken, IconKey } from "./tokens";

/**
 * Carrega regra de produto que o nome não carrega: é `credit` que faz o
 * formulário oferecer cashback, e sobrevive a renomear "Pix" para "Pix Nubank".
 */
export const PAYMENT_KINDS = ["cash", "pix", "credit", "debit", "other"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export interface PaymentMethod extends BaseRow {
  name: string;
  icon: IconKey;
  color: ColorToken;
  kind: PaymentKind;
  /**
   * Só numa lápide: a linha que substituiu esta. Cópias antigas de um padrão,
   * semeadas com id aleatório em cada aparelho, são fundidas na linha de id
   * estável, e quem ainda aponta para a cópia segue para lá. Opcional porque
   * linhas gravadas antes da fusão não têm a coluna.
   */
  mergedInto?: Ulid | null;
}

export type PaymentMethodDraft = Draft<PaymentMethod>;
