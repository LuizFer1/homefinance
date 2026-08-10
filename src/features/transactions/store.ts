import type { Signal } from "@preact/signals";
import {
  type TransactionDraft,
  type TransactionPatch,
  transactionCreated,
  transactionDeleted,
  transactionUpdated,
} from "../../domain/events/transaction";
import type { Ulid } from "../../domain/ids/ulid";
import type { ProjectionState } from "../../domain/projections/apply";
import type { Session, SessionStatus } from "../session/session";

export type StoreStatus = SessionStatus;

export interface TransactionsStore {
  state: Signal<ProjectionState>;
  status: Signal<StoreStatus>;
  error: Signal<string | null>;
  init: () => Promise<void>;
  add: (draft: TransactionDraft) => Promise<void>;
  edit: (entityId: Ulid, patch: TransactionPatch) => Promise<void>;
  remove: (entityId: Ulid) => Promise<void>;
}

/**
 * Única porta de escrita de transações. Relógio, projeção e persistência vêm da
 * `Session`: esta store só sabe **quais eventos** emitir, e é essa separação que
 * permite a store de cadastro existir sem uma segunda cópia do LWW, do relógio ou
 * do caminho de commit.
 */
export function createTransactionsStore(session: Session): TransactionsStore {
  return {
    state: session.state,
    status: session.status,
    error: session.error,
    init: session.init,

    async add(draft: TransactionDraft): Promise<void> {
      // Autoria vem da sessão, não do formulário, e **só** no create. `edit` não
      // a toca: se sua esposa corrige o valor de um lançamento seu, ele continua
      // seu. Isso não depende de vigilância — `TransactionPatch` não tem o campo.
      await session.commit(
        transactionCreated({
          ...session.clock().newEntity(),
          draft,
          userId: session.localUserId.value,
        }),
      );
    },

    async edit(entityId: Ulid, patch: TransactionPatch): Promise<void> {
      await session.commit(transactionUpdated({ ...session.clock().envelope(entityId), patch }));
    },

    async remove(entityId: Ulid): Promise<void> {
      await session.commit(transactionDeleted(session.clock().envelope(entityId)));
    },
  };
}
