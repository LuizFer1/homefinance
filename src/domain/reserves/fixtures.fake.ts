import type { AppState } from "../model/app-state";
import { EMPTY_APP_STATE } from "../model/app-state";
import type { Reserve, ReserveMovement } from "../model/reserve";
import { ALIVE } from "../model/row.fake";
import type { Transaction } from "../model/transaction";

export function tx(
  id: string,
  kind: Transaction["kind"],
  amountMinor: number,
  occurredOn: string,
  categoryId: string | null = null,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    ...ALIVE,
    id,
    kind,
    description: id,
    amountMinor,
    currency: "BRL",
    categoryId,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn,
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
    ...extra,
  };
}

export function reserve(id: string, extra: Partial<Reserve> = {}): Reserve {
  return {
    ...ALIVE,
    id,
    kind: "goal",
    name: id,
    icon: "gift",
    color: "rose",
    targetMinor: null,
    multiple: null,
    essentialCategoryIds: null,
    essentialOverrideMinor: null,
    deadline: null,
    recurring: null,
    ...extra,
  };
}

export function movement(
  id: string,
  reserveId: string,
  amountMinor: number,
  occurredOn: string,
  extra: Partial<ReserveMovement> = {},
): ReserveMovement {
  return {
    ...ALIVE,
    id,
    reserveId,
    amountMinor,
    occurredOn,
    userId: null,
    description: null,
    reason: amountMinor < 0 ? "other" : null,
    recurring: false,
    ...extra,
  };
}

export function stateOf(parts: {
  transactions?: Transaction[];
  reserves?: Reserve[];
  movements?: ReserveMovement[];
}): AppState {
  const byId = <T extends { id: string }>(rows: T[] = []) =>
    Object.fromEntries(rows.map((row) => [row.id, row]));
  return {
    ...EMPTY_APP_STATE,
    transactions: byId(parts.transactions),
    reserves: byId(parts.reserves),
    reserveMovements: byId(parts.movements),
  };
}
