import type { CategoryDraft, PaymentMethodDraft } from "../../domain/events/reference";
import { diffCategory, diffPaymentMethod } from "../../domain/events/reference";
import type { Ulid } from "../../domain/ids/ulid";
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
  /** Excluir mora no sheet de edição (segurar a lixeira). */
  onDelete: (id: Ulid) => void;
}

export const REGISTRY_COPY = {
  category: {
    title: "Categorias",
    empty: "Nenhuma categoria ainda.",
    create: "Nova categoria",
    edit: "Editar categoria",
  },
  paymentMethod: {
    title: "Formas de pagamento",
    empty: "Nenhuma forma de pagamento ainda.",
    create: "Nova forma de pagamento",
    edit: "Editar forma de pagamento",
  },
} as const;

/**
 * Modal de cadastro da página de listagem.
 *
 * Vive fora do `RegistryList` para a página montar o formulário por cima da
 * lista sem misturar estado de edição com a renderização dos itens. Criação e
 * edição passam por aqui; o atalho da home saiu — cadastro é manutenção e mora
 * em Ajustes.
 */
export function RegistryFormModal({
  entity,
  open,
  editing,
  state,
  store,
  onClose,
  onDelete,
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
    <Modal open={open} title={editing === null ? copy.create : copy.edit} onClose={onClose}>
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
          onDelete={editing === null ? undefined : () => onDelete(editing.id)}
        />
      )}
    </Modal>
  );
}
