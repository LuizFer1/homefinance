import type { Ulid } from "../ids/ulid";
import type { BaseRow, Draft } from "./base";

export type TransactionKind = "income" | "expense";

export interface Transaction extends BaseRow {
  kind: TransactionKind;
  description: string;
  /** Inteiro na unidade menor: 1234 é R$ 12,34. */
  amountMinor: number;
  currency: "BRL";
  categoryId: Ulid | null;
  paymentMethodId: Ulid | null;
  /** Retorno de cartão em centavos. Não entra no saldo. */
  cashbackMinor: number | null;
  /** Data do fato, 'YYYY-MM-DD'. Não confundir com `updatedAt`. */
  occurredOn: string;
  /** Autor. Decidido pela store no create; nenhum update o reescreve. */
  userId: Ulid | null;
  recurrenceId: Ulid | null;
  /** `${recurrenceId}:${YYYY-MM}`, ou null para lançamento avulso. */
  occurrenceKey: string | null;
  /**
   * `true`: valor estimado de uma série variável, ainda não confirmado.
   * Ausente vale `null` — linhas anteriores a esta coluna são valores reais.
   */
  estimated?: boolean | null;
  /**
   * Id da linha de PDF que confirmou esta ocorrência. Sem ele, reimportar o
   * mesmo PDF ofereceria a linha de novo como nova (ela não criou transação
   * com o próprio id) e a conta entraria duas vezes.
   */
  importKey?: string | null;
}

/**
 * `userId` fica fora do draft: autoria não é campo de formulário. Como `edit`
 * recebe um draft, ele é estruturalmente incapaz de trocar o autor.
 */
export type TransactionDraft = Omit<Draft<Transaction>, "userId">;
