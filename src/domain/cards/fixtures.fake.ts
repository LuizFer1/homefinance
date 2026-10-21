import type { AppState } from "../model/app-state";
import { EMPTY_APP_STATE } from "../model/app-state";
import type { PaymentMethod } from "../model/payment-method";
import type { Recurrence } from "../model/recurrence";
import { ALIVE } from "../model/row.fake";
import type { Transaction } from "../model/transaction";

/** Cartão de crédito completo; sobrescreva campos para montar variações. */
export function card(id: string, extra: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    ...ALIVE,
    id,
    name: id,
    icon: "credit-card",
    color: "violet",
    kind: "credit",
    mergedInto: null,
    bank: id,
    closingDay: 5,
    dueDay: 12,
    ...extra,
  };
}

/** O cadastro `credit` de antes: sem banco, fechamento nem vencimento. */
export function legacyCard(id: string, extra: Partial<PaymentMethod> = {}): PaymentMethod {
  const base = card(id, extra);
  const { bank: _bank, closingDay: _closing, dueDay: _due, ...old } = base;
  return old;
}

export function purchase(
  id: string,
  paymentMethodId: string | null,
  occurredOn: string,
  amountMinor = 1_000,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    ...ALIVE,
    id,
    kind: "expense",
    description: id,
    amountMinor,
    currency: "BRL",
    categoryId: null,
    paymentMethodId,
    cashbackMinor: null,
    occurredOn,
    userId: null,
    recurrenceId: null,
    occurrenceKey: null,
    ...extra,
  };
}

export function series(
  id: string,
  paymentMethodId: string | null,
  extra: Partial<Recurrence> = {},
): Recurrence {
  return {
    ...ALIVE,
    id,
    kind: "expense",
    description: id,
    amountMinor: 5_000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId,
    cashbackMinor: null,
    frequency: "monthly",
    scheduleType: "dayOfMonth",
    scheduleN: 10,
    startOn: "2026-01-01",
    endOn: null,
    active: true,
    ...extra,
  };
}

export function world(parts: {
  methods?: PaymentMethod[];
  transactions?: Transaction[];
  recurrences?: Recurrence[];
}): AppState {
  const byId = <T extends { id: string }>(rows: T[] = []) =>
    Object.fromEntries(rows.map((row) => [row.id, row]));
  return {
    ...EMPTY_APP_STATE,
    paymentMethods: byId(parts.methods),
    transactions: byId(parts.transactions),
    recurrences: byId(parts.recurrences),
  };
}
