import type { CategoryDraft, PaymentMethodDraft } from "../../domain/events/reference";
import { diffCategory, diffPaymentMethod } from "../../domain/events/reference";
import type {
  CategoryRecord,
  PaymentMethodRecord,
  ProjectionState,
} from "../../domain/projections/apply";
import { listCategories, listPaymentMethods } from "../../domain/projections/selectors";
import { Modal } from "../ui/modal";
import { type RegistryEntity, RegistryWizard } from "./registry-wizard";
import type { RegistryStore } from "./store";

export type RegistryRecord = CategoryRecord | PaymentMethodRecord;

export interface RegistryFormModalProps {
  entity: RegistryEntity;
  open: boolean;
  /** Registro em edição, ou null para criação. */
  editing: RegistryRecord | null;
  state: ProjectionState;
  store: RegistryStore;
  onClose: () => void;
}

export const REGISTRY_COPY = {
  category: {
    title: "Categorias",
    empty: "Nenhuma categoria ainda.",
    create: "Nova categoria",
  },
  paymentMethod: {
    title: "Formas de pagamento",
    empty: "Nenhuma forma de pagamento ainda.",
    create: "Nova forma de pagamento",
  },
} as const;

/**
 * Modal de cadastro, separado da página que lista.
 *
 * A separação existe porque duas telas o abrem: a de Configurações, que lista e
 * edita, e a de Início, cujos botões de ação rápida criam direto. Deixá-lo dentro
 * da página de listagem obrigaria o botão de Início a navegar para Configurações
 * e disparar a abertura de lá — um caminho tortuoso, e frágil porque dependeria
 * de ordem de renderização entre telas.
 */
export function RegistryFormModal({
  entity,
  open,
  editing,
  state,
  store,
  onClose,
}: RegistryFormModalProps) {
  const isPayment = entity === "paymentMethod";
  const items: RegistryRecord[] = isPayment ? listPaymentMethods(state) : listCategories(state);
  const copy = REGISTRY_COPY[entity];

  function handleSubmit(draft: CategoryDraft | PaymentMethodDraft) {
    if (editing === null) {
      if (isPayment) void store.addPaymentMethod(draft as PaymentMethodDraft);
      else void store.addCategory(draft as CategoryDraft);
      onClose();
      return;
    }

    // Patch parcial, nunca o agregado inteiro: emitir tudo faria o LWW por campo
    // perder edições concorrentes sem sintoma visível.
    if (isPayment) {
      const patch = diffPaymentMethod(editing as PaymentMethodRecord, draft as PaymentMethodDraft);
      void store.editPaymentMethod(editing.id, patch);
    } else {
      const patch = diffCategory(editing, draft as CategoryDraft);
      void store.editCategory(editing.id, patch);
    }
    onClose();
  }

  return (
    <Modal open={open} title={editing === null ? copy.create : "Editar item"} onClose={onClose}>
      {/*
        Montada só enquanto aberta, com `key` derivada do registro: trocar de
        registro remonta a wizard e os inicializadores de `useState` releem as
        props. Um `useEffect` de reset rodaria depois do DOM ficar consultável e
        sobrescreveria o que o usuário já digitou.
      */}
      {open && (
        <RegistryWizard
          key={editing?.id ?? "novo"}
          entity={entity}
          editing={editing}
          existingNames={items.map((item) => item.name)}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
