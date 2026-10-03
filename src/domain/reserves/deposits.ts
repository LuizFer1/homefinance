import { dayOfMonthClamped } from "../dates/business-day";
import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import { monthOf } from "../projections/periods";
import { monthBalance } from "./balances";

/**
 * Id do depósito mensal de uma reserva num mês. Igual em qualquer aparelho:
 * dois celulares offline que materializam o mesmo mês gravam a mesma linha, e
 * o LWW converge em vez de guardar duas vezes.
 */
export function depositId(reserveId: Ulid, month: string): Ulid {
  return stableEntityId(`reserve:${reserveId}:${month}`);
}

export interface DepositPlan {
  id: Ulid;
  reserveId: Ulid;
  amountMinor: number;
  occurredOn: string;
}

/**
 * Depósitos mensais devidos **no mês de `today`**. Meses passados não são
 * recuperados: tirar dinheiro de um mês já fechado reescreveria um saldo que a
 * pessoa já viu fechar. Sem saldo no mês, pula sem gravar nada — a próxima
 * abertura tenta de novo, e o salário que cair depois destrava o depósito.
 *
 * Uma linha existente com o id do mês, **mesmo apagada**, encerra o assunto:
 * quem apagou o depósito do mês não o vê voltar.
 */
export function planDeposits(state: AppState, today: string): DepositPlan[] {
  const month = monthOf(today);
  let available = monthBalance(state, month);
  const plans: DepositPlan[] = [];
  const reserves = Object.values(state.reserves)
    .filter((r) => isAlive(r) && r.recurring !== null)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const r of reserves) {
    const rule = r.recurring;
    if (rule === null || month < rule.since) continue;
    if (today < dayOfMonthClamped(month, rule.day)) continue;
    const id = depositId(r.id, month);
    if (state.reserveMovements[id] !== undefined) continue;
    if (available < rule.amountMinor) continue;
    available -= rule.amountMinor;
    plans.push({ id, reserveId: r.id, amountMinor: rule.amountMinor, occurredOn: today });
  }
  return plans;
}
