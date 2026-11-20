import { dayOfMonthClamped } from "../dates/business-day";
import { stableEntityIdV1, stableEntityIdV2 } from "../ids/stable-id";
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

/**
 * "O depósito mensal de `reserveId` em `month` já tem linha?" — viva ou apagada
 * (quem apagou o depósito do mês não o vê voltar), em qualquer id.
 */
export function hasDeposit(
  movements: Readonly<Record<Ulid, ReserveMovement>>,
  reserveId: Ulid,
  month: string,
): boolean {
  return Object.values(movements).some((row) => isDepositFor(row, reserveId, month));
}

/**
 * Lugares de id ocupados: a tabela inteira (as duas contas) mais o que o lote
 * já reservou. Duas reservas cujo depósito do mês cai no mesmo lugar livre não
 * podem ir as duas para v1 — o `insertMissing` derrubaria o lote pelo id repetido.
 */
export interface DepositSlots {
  pick: (reserveId: Ulid, month: string) => Ulid;
}

export function depositSlots(table: Readonly<Record<Ulid, unknown>>): DepositSlots {
  const claimed = new Set<Ulid>();
  return {
    pick(reserveId, month) {
      const v1 = depositId(reserveId, month);
      const id =
        table[v1] === undefined && !claimed.has(v1)
          ? v1
          : stableEntityIdV2(depositSeed(reserveId, month));
      claimed.add(id);
      return id;
    },
  };
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
 * Uma linha existente do depósito do mês (pela chave, `isDepositFor`), **mesmo
 * apagada**, encerra o assunto: quem apagou o depósito do mês não o vê voltar.
 * Sem linha, o id é v1 com o lugar livre e v2 com o lugar de outro fato — viva
 * ou apagada, nunca sobrescrita (spec do id estável, §4.2). `slots` é o da
 * tabela inteira quando quem chama planeja uma conta por vez.
 */
export function planDeposits(
  state: AppState,
  today: string,
  slots: DepositSlots = depositSlots(state.reserveMovements),
): DepositPlan[] {
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
    if (hasDeposit(state.reserveMovements, r.id, month)) continue;
    if (available < rule.amountMinor) continue;
    available -= rule.amountMinor;
    plans.push({
      id: slots.pick(r.id, month),
      reserveId: r.id,
      amountMinor: rule.amountMinor,
      occurredOn: today,
    });
  }
  return plans;
}
