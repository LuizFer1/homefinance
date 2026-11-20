import { dayOfMonthClamped } from "../dates/business-day";
import { stableEntityIdV1 } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { ReserveMovement } from "../model/reserve";
import { monthOf } from "../projections/periods";
import { monthBalance } from "./balances";

/**
 * Id do depósito mensal de uma reserva num mês. Igual em qualquer aparelho:
 * dois celulares offline que materializam o mesmo mês gravam a mesma linha, e
 * o LWW converge em vez de guardar duas vezes.
 */
export function depositId(reserveId: Ulid, month: string): Ulid {
  return stableEntityIdV1(depositSeed(reserveId, month));
}

/** Semente do id do depósito mensal (v1 quando o lugar está livre, v2 na colisão). */
export function depositSeed(reserveId: Ulid, month: string): string {
  return `reserve:${reserveId}:${month}`;
}

type DepositFields = Pick<ReserveMovement, "id" | "reserveId" | "recurring" | "occurredOn"> & {
  period?: string | null;
};

/**
 * "Esta linha é o depósito mensal de `reserveId` em `month`?" — pela chave, não
 * pelo id (spec do id estável, §4.3): a v1 colide, e outra reserva (ou outro mês
 * da mesma) pode morar no lugar.
 *
 * Linha nova grava `period`. Linha antiga não tem: sempre está num id v1, porque
 * só o planejador e o "Guardar" que liga a recorrência gravam `recurring: true`,
 * e os dois usavam `depositId`. Então, em ordem:
 * 1. o mês da data, **se** o id é o v1 desse mês (a data não foi editada);
 * 2. senão (a data foi movida para outro mês), vale pelo lugar: é o de `month`
 *    se o id é o v1 de `month`.
 * A ordem importa: só o lugar deixaria dois meses da mesma reserva que colidem
 * na v1 bloquearem um ao outro, e só a data faria a data editada bloquear o mês
 * para onde foi e liberar de novo o mês de onde saiu.
 */
export function isDepositFor(row: DepositFields, reserveId: Ulid, month: string): boolean {
  if (row.reserveId !== reserveId || row.recurring !== true) return false;
  if (typeof row.period === "string") return row.period === month;
  const dated = monthOf(row.occurredOn);
  if (row.id === depositId(reserveId, dated)) return dated === month;
  return row.id === depositId(reserveId, month);
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
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const r of reserves) {
    const rule = r.recurring;
    // Linha corrompida ou de versão futura nunca pode planejar depósito zero ou negativo.
    if (rule === null || rule.amountMinor <= 0 || month < rule.since) continue;
    if (today < dayOfMonthClamped(month, rule.day)) continue;
    const id = depositId(r.id, month);
    if (state.reserveMovements[id] !== undefined) continue;
    if (available < rule.amountMinor) continue;
    available -= rule.amountMinor;
    plans.push({ id, reserveId: r.id, amountMinor: rule.amountMinor, occurredOn: today });
  }
  return plans;
}
