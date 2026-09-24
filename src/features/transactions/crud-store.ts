import type { Ulid } from "../../domain/ids/ulid";
import type { Transaction, TransactionDraft } from "../../domain/model/transaction";
import type { CrudSession } from "../session/crud-session";

/**
 * Lançamentos avulsos. Estado, status e boot moram na sessão, não aqui.
 */
export interface TransactionsStore {
  add: (draft: TransactionDraft) => Promise<Transaction>;
  edit: (id: Ulid, draft: TransactionDraft) => Promise<Transaction>;
  remove: (id: Ulid) => Promise<Transaction>;
}

export function createTransactionsStore(session: CrudSession): TransactionsStore {
  return {
    // Autoria vem da sessão, só no create.
    add: (draft) =>
      session.mutate("transactions", (repo) =>
        repo.create({ ...draft, userId: session.localUserId.value }),
      ),
    // `repository.update` só sanitiza as colunas de `BaseRow`; `userId` não é
    // uma delas, então um `changes` que carregue o campo por fora do tipo
    // (cast, bug de UI) seria mesclado normalmente. A exclusão explícita aqui
    // é a proteção de verdade: `TransactionDraft` barra isso em tempo de
    // compilação, mas quem chama em runtime não é obrigado a respeitar o tipo.
    edit: (id, draft) => {
      const { userId: _userId, ...semAutor } = draft as TransactionDraft & { userId?: unknown };
      return session.mutate("transactions", (repo) => repo.update(id, semAutor));
    },
    remove: (id) => session.mutate("transactions", (repo) => repo.remove(id)),
  };
}
