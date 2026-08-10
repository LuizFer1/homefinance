import type { Ulid } from "../ids/ulid";
import { CURRENT_SCHEMA_VERSION, type DomainEvent } from "./types";

export type TransactionKind = "income" | "expense";

export interface Transaction {
  id: Ulid;
  kind: TransactionKind;
  description: string;
  /** Inteiro na unidade menor: 1234 é R$ 12,34. Nunca float, nunca string. */
  amountMinor: number;
  currency: "BRL";
  categoryId: Ulid | null;
  paymentMethodId: Ulid | null;
  /**
   * Retorno de cartao em centavos, nao percentual.
   *
   * Percentual seria mais fiel ao contrato do cartao e mais errado na pratica:
   * exigiria uma regra de arredondamento propria e o valor calculado quase nunca
   * bate com o que aparece na fatura. Guardar o que o extrato mostra responde
   * direto a pergunta que o usuario faz — quanto recebi de volta.
   *
   * **Nao entra no saldo.** E atributo da despesa, nao receita: somar exigiria
   * decidir quando o dinheiro entra de fato, o que varia por emissor e nao e
   * observavel pelo app.
   */
  cashbackMinor: number | null;
  /** Data do fato, escolhida pelo usuário. Não confundir com o HLC. */
  occurredOn: string;
}

export type TransactionDraft = Omit<Transaction, "id">;
export type TransactionPatch = Partial<Omit<Transaction, "id" | "currency">>;

interface Envelope {
  eventId: Ulid;
  entityId: Ulid;
  deviceId: Ulid;
  hlc: string;
}

function envelopeToEvent(
  envelope: Envelope,
  action: DomainEvent["action"],
  data: Record<string, unknown>,
): DomainEvent {
  return {
    id: envelope.eventId,
    entity: "transaction",
    entityId: envelope.entityId,
    action,
    data,
    deviceId: envelope.deviceId,
    hlc: envelope.hlc,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export function transactionCreated(args: Envelope & { draft: TransactionDraft }): DomainEvent {
  return envelopeToEvent(args, "create", { ...args.draft });
}

export function transactionUpdated(args: Envelope & { patch: TransactionPatch }): DomainEvent {
  return envelopeToEvent(args, "update", { ...args.patch });
}

export function transactionDeleted(args: Envelope): DomainEvent {
  return envelopeToEvent(args, "delete", {});
}

/**
 * Campos alterados entre o registro atual e o que o formulário devolveu.
 * Emitir o agregado inteiro num `update` transformaria o patch parcial num
 * documento disfarçado e faria o LWW por campo perder edições concorrentes
 * sem nenhum sintoma visível.
 */
export function diffTransaction(current: Transaction, next: TransactionDraft): TransactionPatch {
  const patch: TransactionPatch = {};
  if (current.kind !== next.kind) patch.kind = next.kind;
  if (current.description !== next.description) patch.description = next.description;
  if (current.amountMinor !== next.amountMinor) patch.amountMinor = next.amountMinor;
  if (current.categoryId !== next.categoryId) patch.categoryId = next.categoryId;
  if (current.paymentMethodId !== next.paymentMethodId) {
    patch.paymentMethodId = next.paymentMethodId;
  }
  // Precisa estar aqui para a limpeza chegar ao log. Sem esta comparacao o patch
  // sai vazio quando o cashback e zerado, e o dado sujo fica no registro para
  // sempre — invisivel na tela, presente no export.
  if (current.cashbackMinor !== next.cashbackMinor) patch.cashbackMinor = next.cashbackMinor;
  if (current.occurredOn !== next.occurredOn) patch.occurredOn = next.occurredOn;
  return patch;
}
