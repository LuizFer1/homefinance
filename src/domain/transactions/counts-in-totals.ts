import type { Transaction } from "../model/transaction";

/**
 * Se o lançamento entra em saldo, receita, despesa, categorias, ritmo,
 * comparação e cashback. É a regra única: toda projeção que soma passa por aqui,
 * senão duas telas discordam sobre o mesmo mês.
 *
 * Só os dois estados conhecidos tiram o lançamento da conta. Um valor que esta
 * versão não conhece (vindo do sync de uma versão futura) conta como normal: o
 * erro seguro é somar a mais, nunca fazer o dinheiro sumir sem o usuário ver.
 */
export function countsInTotals(record: Pick<Transaction, "reportState">): boolean {
  return record.reportState !== "transfer" && record.reportState !== "hidden";
}
