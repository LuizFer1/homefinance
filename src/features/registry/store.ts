import type {
  CategoryDraft,
  CategoryPatch,
  PaymentMethodDraft,
  PaymentMethodPatch,
} from "../../domain/events/reference";
import {
  categoryCreated,
  categoryDeleted,
  categoryUpdated,
  paymentMethodCreated,
  paymentMethodDeleted,
  paymentMethodUpdated,
} from "../../domain/events/reference";
import type { Ulid } from "../../domain/ids/ulid";
import type { Session } from "../session/session";

export interface RegistryStore {
  addCategory: (draft: CategoryDraft) => Promise<void>;
  editCategory: (entityId: Ulid, patch: CategoryPatch) => Promise<void>;
  removeCategory: (entityId: Ulid) => Promise<void>;
  addPaymentMethod: (draft: PaymentMethodDraft) => Promise<void>;
  editPaymentMethod: (entityId: Ulid, patch: PaymentMethodPatch) => Promise<void>;
  removePaymentMethod: (entityId: Ulid) => Promise<void>;
}

/** Patch vazio não vira evento: um log append-only não merece lixo permanente. */
function isEmpty(patch: object): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * Porta de escrita única das entidades de referência.
 *
 * Não guarda estado próprio: relógio, projeção e persistência vêm da `Session`,
 * compartilhada com a store de transações. Uma projeção separada divergiria, e um
 * relógio separado entrelaçaria os HLCs.
 */
export function createRegistryStore(session: Session): RegistryStore {
  return {
    async addCategory(draft: CategoryDraft): Promise<void> {
      await session.commit(categoryCreated({ ...session.clock().newEntity(), draft }));
    },

    async editCategory(entityId: Ulid, patch: CategoryPatch): Promise<void> {
      if (isEmpty(patch)) return;
      await session.commit(categoryUpdated({ ...session.clock().envelope(entityId), patch }));
    },

    async removeCategory(entityId: Ulid): Promise<void> {
      await session.commit(categoryDeleted(session.clock().envelope(entityId)));
    },

    async addPaymentMethod(draft: PaymentMethodDraft): Promise<void> {
      await session.commit(paymentMethodCreated({ ...session.clock().newEntity(), draft }));
    },

    async editPaymentMethod(entityId: Ulid, patch: PaymentMethodPatch): Promise<void> {
      if (isEmpty(patch)) return;
      await session.commit(paymentMethodUpdated({ ...session.clock().envelope(entityId), patch }));
    },

    async removePaymentMethod(entityId: Ulid): Promise<void> {
      await session.commit(paymentMethodDeleted(session.clock().envelope(entityId)));
    },
  };
}
