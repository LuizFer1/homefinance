import type { BaseRow, Draft } from "./base";
import type { BookScoped } from "./book";

/**
 * Dívida do negócio: cadastro simples com saldo devedor editável (sem parcelas
 * nem juros calculados). Nunca entra em receita nem despesa.
 */
export interface Debt extends BaseRow, BookScoped {
  name: string;
  creditor?: string | null;
  /** Valor original, em centavos. */
  principalMinor: number;
  /** Saldo devedor atual, em centavos. */
  balanceMinor: number;
  /** 'YYYY-MM-DD' do vencimento, ou ausente. */
  dueOn?: string | null;
}

export type DebtDraft = Draft<Debt>;
