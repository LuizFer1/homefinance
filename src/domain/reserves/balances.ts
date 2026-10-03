import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { Reserve } from "../model/reserve";
import { filterByMonth } from "../projections/breakdown";
import { monthOf } from "../projections/periods";
import { listTransactions, totals } from "../projections/selectors";

function aliveMovements(state: AppState) {
  return Object.values(state.reserveMovements).filter((m) => isAlive(m));
}

export function reserveBalance(state: AppState, reserveId: Ulid): number {
  let sum = 0;
  for (const m of aliveMovements(state)) if (m.reserveId === reserveId) sum += m.amountMinor;
  return sum;
}

/**
 * Líquido guardado no mês, de **todas** as reservas, inclusive apagadas: o
 * dinheiro mudou de lugar de fato, e a retirada final gravada na exclusão é
 * quem o devolve. Filtrar por reserva viva faria o saldo do mês "ganhar" de
 * volta, no mês antigo, o que foi guardado numa reserva excluída depois.
 */
export function savedInMonth(state: AppState, month: string): number {
  let sum = 0;
  for (const m of aliveMovements(state)) if (monthOf(m.occurredOn) === month) sum += m.amountMinor;
  return sum;
}

/** Guardar não é despesa, mas tira do mês: é este número, não `totals`, que o sheet mostra. */
export function monthBalance(state: AppState, month: string): number {
  return (
    totals(filterByMonth(listTransactions(state), month)).balanceMinor - savedInMonth(state, month)
  );
}

/** "Saldo total" do Início: o dinheiro que não está separado em reserva nenhuma. */
export function availableBalance(state: AppState): number {
  let saved = 0;
  for (const m of aliveMovements(state)) saved += m.amountMinor;
  return totals(listTransactions(state)).balanceMinor - saved;
}

/**
 * A emergência da casa. Dois celulares offline podem criar uma cada; a de
 * menor id vence em todo aparelho igual, sem depender de quem sincronizou
 * primeiro. A outra é exibida como caixinha com aviso.
 */
export function emergencyOf(state: AppState): Reserve | null {
  let found: Reserve | null = null;
  for (const r of Object.values(state.reserves)) {
    if (!isAlive(r) || r.kind !== "emergency") continue;
    if (found === null || r.id < found.id) found = r;
  }
  return found;
}

export function isDuplicateEmergency(state: AppState, r: Reserve): boolean {
  return r.kind === "emergency" && emergencyOf(state)?.id !== r.id;
}

/** Emergência primeiro; o resto por id (ULID = ordem de criação). */
export function listReserves(state: AppState): Reserve[] {
  const emergency = emergencyOf(state);
  const rest = Object.values(state.reserves)
    .filter((r) => isAlive(r) && r.id !== emergency?.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return emergency === null ? rest : [emergency, ...rest];
}
