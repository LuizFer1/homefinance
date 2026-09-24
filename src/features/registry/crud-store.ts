import type { Ulid } from "../../domain/ids/ulid";
import type { Category, CategoryDraft } from "../../domain/model/category";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
import type { CrudSession } from "../session/crud-session";

/**
 * Cadastro de categorias e formas de pagamento. `edit` recebe o draft inteiro:
 * com LWW por linha não existe patch, e o repositório já ignora edição sem
 * mudança.
 */
export interface RegistryStore {
  addCategory: (draft: CategoryDraft) => Promise<Category>;
  editCategory: (id: Ulid, draft: CategoryDraft) => Promise<Category>;
  removeCategory: (id: Ulid) => Promise<Category>;
  addPaymentMethod: (draft: PaymentMethodDraft) => Promise<PaymentMethod>;
  editPaymentMethod: (id: Ulid, draft: PaymentMethodDraft) => Promise<PaymentMethod>;
  removePaymentMethod: (id: Ulid) => Promise<PaymentMethod>;
}

/**
 * Não guarda estado próprio: relógio, projeção e persistência vêm da
 * `CrudSession`, compartilhada com a store de transações. Cada método faz uma
 * única chamada ao repositório dentro de `mutate`, como o contrato exige.
 */
export function createRegistryStore(session: CrudSession): RegistryStore {
  return {
    addCategory: (draft) => session.mutate("categories", (repo) => repo.create(draft)),
    editCategory: (id, draft) => session.mutate("categories", (repo) => repo.update(id, draft)),
    removeCategory: (id) => session.mutate("categories", (repo) => repo.remove(id)),
    addPaymentMethod: (draft) => session.mutate("paymentMethods", (repo) => repo.create(draft)),
    editPaymentMethod: (id, draft) =>
      session.mutate("paymentMethods", (repo) => repo.update(id, draft)),
    removePaymentMethod: (id) => session.mutate("paymentMethods", (repo) => repo.remove(id)),
  };
}
