import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import { NEUTRAL_TOKEN } from "../model/tokens";
import type { Transaction } from "../model/transaction";
import { countsInTotals } from "../transactions/counts-in-totals";

export interface CardSegment {
  /** Estável para a `key` da lista: id do cartão, ou "removed" / "others". */
  key: string;
  /** Cartão vivo; nulo nos segmentos que agrupam (removidos, demais). */
  cardId: Ulid | null;
  name: string;
  /** Token da cor do cartão; neutro quando ele sumiu ou virou "Outros". */
  color: string;
  minor: number;
}

/** Quantos segmentos a barra mostra; o resto vira "Outros cartões". */
export const MAX_CARD_SEGMENTS = 5;

export const REMOVED_CARD_NAME = "Cartão removido";
export const OTHER_CARDS_NAME = "Outros cartões";

/**
 * Despesa do mês em cartão de crédito, por cartão, para a barra da Home.
 *
 * `monthItems` já vem filtrado pelo mês e por `listTransactions`. Conta como
 * `totals` conta (só despesa que `countsInTotals` aceita): a barra mostra uma
 * parte da despesa que já está no total, nunca soma por fora. O gasto entra na
 * compra, não no vencimento da fatura.
 *
 * Só vira segmento o lançamento cujo método é conhecido e de crédito. Cartão
 * apagado fica com a cor neutra e o nome "Cartão removido" (apagar não cascateia,
 * então a referência morta é normal); id que nem está no estado não se sabe se
 * era cartão e fica de fora. Passou de `MAX_CARD_SEGMENTS`, os menores se
 * juntam num segmento neutro: a barra não vira uma tira ilegível.
 */
export function cardSpend(
  monthItems: readonly Transaction[],
  state: AppState,
): { segments: CardSegment[]; cardMinor: number } {
  const byKey = new Map<string, CardSegment>();

  for (const record of monthItems) {
    if (record.kind !== "expense" || !countsInTotals(record) || record.paymentMethodId === null) {
      continue;
    }
    const method = state.paymentMethods[record.paymentMethodId];
    if (method === undefined || method.kind !== "credit") continue;

    const alive = isAlive(method);
    const key = alive ? method.id : "removed";
    const found = byKey.get(key);
    if (found !== undefined) {
      found.minor += record.amountMinor;
      continue;
    }
    byKey.set(
      key,
      alive
        ? {
            key,
            cardId: method.id,
            name: method.name,
            color: method.color,
            minor: record.amountMinor,
          }
        : {
            key,
            cardId: null,
            name: REMOVED_CARD_NAME,
            color: NEUTRAL_TOKEN,
            minor: record.amountMinor,
          },
    );
  }

  const sorted = [...byKey.values()].sort((a, b) =>
    a.minor !== b.minor ? b.minor - a.minor : a.key < b.key ? -1 : 1,
  );
  const cardMinor = sorted.reduce((sum, segment) => sum + segment.minor, 0);

  if (sorted.length <= MAX_CARD_SEGMENTS) return { segments: sorted, cardMinor };

  const head = sorted.slice(0, MAX_CARD_SEGMENTS - 1);
  const rest = sorted.slice(MAX_CARD_SEGMENTS - 1);
  return {
    segments: [
      ...head,
      {
        key: "others",
        cardId: null,
        name: OTHER_CARDS_NAME,
        color: NEUTRAL_TOKEN,
        minor: rest.reduce((sum, segment) => sum + segment.minor, 0),
      },
    ],
    cardMinor,
  };
}
