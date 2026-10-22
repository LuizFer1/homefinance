import { GENESIS_HLC, LEGACY_CREDIT_METHOD_ID } from "../defaults/defaults";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { PaymentMethod } from "../model/payment-method";
import type { Recurrence } from "../model/recurrence";
import type { Transaction } from "../model/transaction";
import { listPaymentMethods } from "../projections/selectors";
import { isIncompleteCard } from "./card";

/** Os lançamentos (e séries) de um mesmo cartão por completar. */
export interface CardGroup {
  source: PaymentMethod;
  transactions: Transaction[];
  /** Séries vivas que apontam para o mesmo método: sem elas a próxima ocorrência recria o problema. */
  recurrences: Recurrence[];
  /** Despesa menos receita do grupo, só para a tela dar ordem de grandeza. */
  netMinor: number;
}

/**
 * Cartões de crédito por completar que ainda têm lançamento vivo, agrupados pelo
 * método de origem. É o gatilho da migração, **derivado do estado**: sem flag de
 * versão, vale em qualquer aparelho depois do sync e some sozinho quando o
 * último grupo é atribuído (as linhas passam a apontar para um cartão completo).
 *
 * Método apagado não entra: não se sabe o que era e o lançamento mostra "Forma
 * removida" como em qualquer outra forma excluída. Método com `mergedInto` já
 * foi redirecionado por `resolveMerged`, então nem chega aqui com referência.
 * Pura e idempotente.
 */
export function pendingCardGroups(state: AppState): CardGroup[] {
  const groups = new Map<Ulid, CardGroup>();

  for (const record of Object.values(state.transactions)) {
    if (!isAlive(record) || record.paymentMethodId === null) continue;
    const source = state.paymentMethods[record.paymentMethodId];
    if (!isAlive(source) || !isIncompleteCard(source)) continue;

    const group = groups.get(source.id) ?? {
      source,
      transactions: [],
      recurrences: [],
      netMinor: 0,
    };
    group.transactions.push(record);
    group.netMinor += record.kind === "expense" ? record.amountMinor : -record.amountMinor;
    groups.set(source.id, group);
  }

  for (const record of Object.values(state.recurrences)) {
    if (!isAlive(record) || record.paymentMethodId === null) continue;
    groups.get(record.paymentMethodId)?.recurrences.push(record);
  }

  return [...groups.values()].sort((a, b) =>
    b.transactions.length !== a.transactions.length
      ? b.transactions.length - a.transactions.length
      : a.source.id < b.source.id
        ? -1
        : 1,
  );
}

/**
 * Formas de pagamento oferecidas ao lançar: todas as vivas, menos o genérico
 * que ninguém usa (`unusedGenericCard`).
 */
export function listPickableMethods(state: AppState): PaymentMethod[] {
  const hidden = unusedGenericCard(state);
  const all = listPaymentMethods(state);
  return hidden === null ? all : all.filter((method) => method.id !== hidden.id);
}

/**
 * O "Cartão de crédito" genérico que ninguém usou: ainda é a semente intocada
 * (HLC de gênese, ninguém editou), sem lançamento nem série vivos apontando para
 * ele. Não há o que migrar, e ele só ocuparia a lista de pagamento como um
 * "cartão" sem dados. Devolve a linha, ou nulo.
 *
 * É só um predicado de leitura: o app esconde essa linha dos seletores, mas não
 * a apaga. Apagar no boot seria uma escrita às cegas — outro aparelho pode estar
 * usando o genérico e ainda não ter sincronizado, e a lápide chegaria antes das
 * compras dele, que ficariam como "Forma removida" sem o aviso da migração.
 */
export function unusedGenericCard(state: AppState): PaymentMethod | null {
  const row = state.paymentMethods[LEGACY_CREDIT_METHOD_ID];
  if (!isAlive(row) || !isIncompleteCard(row) || row.updatedAt !== GENESIS_HLC) return null;

  const referenced =
    Object.values(state.transactions).some(
      (record) => isAlive(record) && record.paymentMethodId === row.id,
    ) ||
    Object.values(state.recurrences).some(
      (record) => isAlive(record) && record.paymentMethodId === row.id,
    );
  return referenced ? null : row;
}
