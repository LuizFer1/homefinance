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
}

export type PaymentMethodDraft = Draft<PaymentMethod>;
