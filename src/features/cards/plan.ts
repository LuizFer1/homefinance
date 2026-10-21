import { buildRow } from "../../data/repository";
import { isCompleteCard, isValidCardDay } from "../../domain/cards/card";
import { type CardGroup, pendingCardGroups } from "../../domain/cards/migration";
import type { RowClock } from "../../domain/clock/row-clock";
import type { Ulid } from "../../domain/ids/ulid";
import type { AppState, RowsByTable } from "../../domain/model/app-state";
import { isAlive } from "../../domain/model/base";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
import type { Recurrence } from "../../domain/model/recurrence";
import { COLOR_TOKENS, type ColorToken } from "../../domain/model/tokens";
import type { Transaction } from "../../domain/model/transaction";
import type { ExpectedVersions } from "../session/session";

/** Dados de um cartão novo criado dentro da migração. */
export interface NewCardInput {
  bank: string;
  /** Vazio usa o banco como nome. */
  name: string;
  closingDay: number;
  dueDay: number;
  color: ColorToken;
}

/** Destino de um grupo: um cartão completo que já existe, ou um novo. */
export type Destination = { kind: "existing"; cardId: Ulid } | { kind: "new"; card: NewCardInput };

export interface MigrationPlan {
  rows: RowsByTable;
  expected: ExpectedVersions;
  /** Lançamentos regravados. */
  moved: number;
}

/** O rascunho que o cadastro grava para um cartão de crédito novo. */
export function cardDraft(input: NewCardInput): PaymentMethodDraft {
  const bank = input.bank.trim();
  return {
    name: input.name.trim() === "" ? bank : input.name.trim(),
    icon: "credit-card",
    color: input.color,
    kind: "credit",
    mergedInto: null,
    bank,
    closingDay: input.closingDay,
    dueDay: input.dueDay,
  };
}

/** Nulo se os dados servem; senão o motivo, em português. */
export function newCardProblem(input: NewCardInput): string | null {
  if (input.bank.trim() === "") return "Informe o banco do cartão.";
  if (!isValidCardDay(input.closingDay)) return "O fechamento precisa ser um dia de 1 a 31.";
  if (!isValidCardDay(input.dueDay)) return "O vencimento precisa ser um dia de 1 a 31.";
  if (!(COLOR_TOKENS as readonly string[]).includes(input.color)) return "Escolha uma cor.";
  return null;
}

/**
 * Lote da migração: cada grupo escolhido passa seus lançamentos e séries para o
 * cartão de destino, e o método de origem vira lápide com `mergedInto` apontando
 * para o destino.
 *
 * - **Séries também.** Uma série mensal que continuasse no genérico geraria uma
 *   compra nova nele todo mês, e o aviso voltaria.
 * - **Lápide com `mergedInto`.** Nunca se apaga uma linha referenciada: o
 *   `resolveMerged` leva para o destino a compra que um aparelho ainda na versão
 *   velha lançar no genérico depois, e o hub segue o mesmo redirecionamento.
 * - **Versões esperadas** de tudo que é regravado: o lote vai por
 *   `putRowsIfCurrent`, que recusa (`StaleRowsError`) se outro aparelho mexeu em
 *   alguma dessas linhas, em vez de desfazer a edição dele.
 *
 * Grupo sem escolha fica como está. Destino inválido lança antes de gravar.
 */
export function planCardMigration(
  state: AppState,
  choices: Readonly<Record<Ulid, Destination>>,
  clock: RowClock,
): MigrationPlan {
  const transactions: Transaction[] = [];
  const recurrences: Recurrence[] = [];
  const methods: PaymentMethod[] = [];
  const expected: ExpectedVersions = { transactions: {}, recurrences: {}, paymentMethods: {} };

  for (const group of pendingCardGroups(state)) {
    const choice = choices[group.source.id];
    if (choice === undefined) continue;

    const destination = resolveDestination(state, group, choice, clock);
    const destinationId = destination.row.id;
    if (destination.created) methods.push(destination.row);
    // A versão do destino existente também é esperada: se alguém o apagou ou o
    // editou enquanto a tela estava aberta, o lote é recusado.
    else
      expected.paymentMethods = {
        ...expected.paymentMethods,
        [destinationId]: destination.row.updatedAt,
      };
    expected.paymentMethods = {
      ...expected.paymentMethods,
      [group.source.id]: group.source.updatedAt,
    };

    for (const record of group.transactions) {
      transactions.push({
        ...record,
        paymentMethodId: destinationId,
        updatedAt: clock.stamp().hlc,
        dirty: 1,
      });
      expected.transactions = { ...expected.transactions, [record.id]: record.updatedAt };
    }
    for (const record of group.recurrences) {
      recurrences.push({
        ...record,
        paymentMethodId: destinationId,
        updatedAt: clock.stamp().hlc,
        dirty: 1,
      });
      expected.recurrences = { ...expected.recurrences, [record.id]: record.updatedAt };
    }

    const hlc = clock.stamp().hlc;
    methods.push({
      ...group.source,
      mergedInto: destinationId,
      deletedAt: hlc,
      updatedAt: hlc,
      dirty: 1,
    });
  }

  return {
    rows: { transactions, recurrences, paymentMethods: methods },
    expected,
    moved: transactions.length,
  };
}

function resolveDestination(
  state: AppState,
  group: CardGroup,
  choice: Destination,
  clock: RowClock,
): { row: PaymentMethod; created: boolean } {
  if (choice.kind === "existing") {
    const card = state.paymentMethods[choice.cardId];
    if (!isAlive(card) || !isCompleteCard(card) || card.id === group.source.id) {
      throw new Error("O cartão escolhido não existe mais ou está sem dados. Escolha outro.");
    }
    return { row: card, created: false };
  }

  const problem = newCardProblem(choice.card);
  if (problem !== null) throw new Error(problem);
  return { row: buildRow<PaymentMethod>(clock, cardDraft(choice.card)), created: true };
}
