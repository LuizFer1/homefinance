import type { TransactionKind } from "../events/transaction";

/**
 * Se o lançamento comporta cashback.
 *
 * A regra depende do `kind` da forma de pagamento, e é por isso que `kind` existe
 * na entidade em vez de ser inferido do nome: o usuário pode chamar seu cartão de
 * "Nubank roxinho" e a regra continua funcionando.
 *
 * Pura e num lugar só de propósito. Repetida no JSX, a metade "esconder o campo"
 * e a metade "limpar o valor" acabam divergindo — e a segunda é a que importa,
 * porque um cashback pendurado numa despesa em dinheiro é dado sujo permanente:
 * invisível na tela, presente no export, imortal no log append-only.
 *
 * `paymentKind` é `string` e não `PaymentKind` porque vem da projeção, que aceita
 * valor desconhecido de propósito. Tipo estreito aqui obrigaria um cast na UI.
 */
export function offersCashback(
  paymentKind: string | null,
  transactionKind: TransactionKind,
): boolean {
  if (transactionKind !== "expense") return false;
  return paymentKind === "credit" || paymentKind === "debit";
}
