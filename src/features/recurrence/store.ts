import {
  type RecurrenceDraft,
  type RecurrencePatch,
  recurrenceCreated,
  recurrenceDeleted,
  recurrenceUpdated,
} from "../../domain/events/recurrence";
import { type TransactionDraft, transactionCreated } from "../../domain/events/transaction";
import type { Ulid } from "../../domain/ids/ulid";
import { planMaterializations } from "../../domain/recurrence/materialize";
import type { Session } from "../session/session";
import type { RecurrenceInput } from "../transactions/transaction-wizard";

export interface RecurrenceStore {
  /**
   * Cria a série a partir do rascunho do lançamento + regra, e materializa
   * todas as competências vencidas até `today`.
   */
  createSeries: (draft: TransactionDraft, rule: RecurrenceInput, today: string) => Promise<void>;
  /** Gera ocorrências faltantes das séries ativas (chamar no boot e ao virar o dia). */
  materializeDue: (today: string) => Promise<void>;
  editSeries: (entityId: Ulid, patch: RecurrencePatch) => Promise<void>;
  removeSeries: (entityId: Ulid) => Promise<void>;
}

function isEmpty(patch: object): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * Porta de escrita das séries e da materialização.
 *
 * Materializar emite `transaction.create` com `entityId` determinístico: o
 * commit usa `envelope` com id fixo, não `newEntity()`, senão cada aparelho
 * geraria um salário distinto para o mesmo mês.
 */
export function createRecurrenceStore(session: Session): RecurrenceStore {
  async function materializeDue(today: string): Promise<void> {
    const plans = planMaterializations(session.state.value, today);
    const userId = session.localUserId.value;

    for (const plan of plans) {
      // Reavalia a cada passo: um create anterior já preencheu a projeção.
      if (session.state.value.transactions[plan.entityId]?.materialized) continue;

      const envelope = session.clock().envelope(plan.entityId);
      await session.commit(
        transactionCreated({
          ...envelope,
          draft: plan.draft,
          userId,
        }),
      );
    }
  }

  return {
    async createSeries(draft, rule, today): Promise<void> {
      const seriesDraft: RecurrenceDraft = {
        kind: draft.kind,
        description: draft.description,
        amountMinor: draft.amountMinor,
        currency: "BRL",
        categoryId: draft.categoryId,
        paymentMethodId: draft.paymentMethodId,
        cashbackMinor: draft.cashbackMinor,
        frequency: rule.frequency,
        scheduleType: rule.scheduleType,
        scheduleN: rule.scheduleN,
        startOn: draft.occurredOn,
        endOn: rule.endOn,
        active: true,
      };

      await session.commit(
        recurrenceCreated({ ...session.clock().newEntity(), draft: seriesDraft }),
      );
      await materializeDue(today);
    },

    materializeDue,

    async editSeries(entityId, patch): Promise<void> {
      if (isEmpty(patch)) return;
      await session.commit(recurrenceUpdated({ ...session.clock().envelope(entityId), patch }));
    },

    async removeSeries(entityId): Promise<void> {
      await session.commit(recurrenceDeleted(session.clock().envelope(entityId)));
    },
  };
}
