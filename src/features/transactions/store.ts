import type { Ulid } from "../../domain/ids/ulid";
import type { Transaction, TransactionDraft } from "../../domain/model/transaction";
import { MAX_MINOR } from "../../domain/money/mask";
import type { Session } from "../session/session";

/**
 * Lançamentos avulsos. Estado, status e boot moram na sessão, não aqui.
 */
export interface TransactionsStore {
  add: (draft: TransactionDraft) => Promise<Transaction>;
  edit: (id: Ulid, draft: TransactionDraft) => Promise<Transaction>;
  remove: (id: Ulid) => Promise<Transaction>;
  /** Valor real de uma estimativa: grava valor e data e tira a marca. */
  confirm: (
    id: Ulid,
    actual: Pick<Transaction, "amountMinor" | "occurredOn">,
  ) => Promise<Transaction>;
}

export function createTransactionsStore(session: Session): TransactionsStore {
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
    // `estimated: false` explícito, e não `null`: muda a linha mesmo quando o
    // valor real veio igual à estimativa, e o repositório só grava com mudança.
    confirm: (id, { amountMinor, occurredOn }) =>
      session.mutate("transactions", async (repo) => {
        // Dentro do `op`, para a recusa preencher `session.error` como as
        // outras falhas de escrita.
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_MINOR) {
          throw new Error("Valor inválido");
        }
        return repo.update(id, { amountMinor, occurredOn, estimated: false });
      }),
  };
}
