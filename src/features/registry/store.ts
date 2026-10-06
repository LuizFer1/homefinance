import { planDefaultsMerge } from "../../domain/defaults/merge";
import type { Ulid } from "../../domain/ids/ulid";
import type { Category, CategoryDraft } from "../../domain/model/category";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
import type { Session } from "../session/session";

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
  /**
   * Funde as cópias de categoria e forma padrão que cada aparelho semeou com id
   * próprio antes de o padrão ter id fixo (`planDefaultsMerge`). Para o boot e
   * o `afterPull`; sem cópias, não grava.
   */
  mergeLegacyDefaults: () => Promise<void>;
}

/**
 * Não guarda estado próprio: relógio, estado em memória e persistência vêm da
 * `Session`, compartilhada com a store de transações. Cada método faz uma
 * única chamada ao repositório dentro de `mutate`, como o contrato exige.
 */
export function createRegistryStore(session: Session): RegistryStore {
  return {
    addCategory: (draft) => session.mutate("categories", (repo) => repo.create(draft)),
    editCategory: (id, draft) => session.mutate("categories", (repo) => repo.update(id, draft)),
    removeCategory: (id) => session.mutate("categories", (repo) => repo.remove(id)),
    addPaymentMethod: (draft) => session.mutate("paymentMethods", (repo) => repo.create(draft)),
    editPaymentMethod: (id, draft) =>
      session.mutate("paymentMethods", (repo) => repo.update(id, draft)),
    removePaymentMethod: (id) => session.mutate("paymentMethods", (repo) => repo.remove(id)),
    async mergeLegacyDefaults() {
      const clock = session.clock();
      const plan = planDefaultsMerge(session.state.value, () => clock.stamp().hlc);
      if (plan === null) return;
      // `IfCurrent`: o plano regrava linhas inteiras a partir do state, que pode
      // estar velho (outra aba, sync). Divergiu, nada é gravado; o próximo boot
      // ou pull planeja de novo sobre o estado certo.
      await session.putRowsIfCurrent(plan.rows, plan.expected);
    },
  };
}
