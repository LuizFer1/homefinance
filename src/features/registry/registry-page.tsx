import { useState } from "preact/hooks";
import type { CategoryDraft, PaymentMethodDraft } from "../../domain/events/reference";
import { diffCategory, diffPaymentMethod } from "../../domain/events/reference";
import type { Ulid } from "../../domain/ids/ulid";
import type {
  CategoryRecord,
  PaymentMethodRecord,
  ProjectionState,
} from "../../domain/projections/apply";
import { listCategories, listPaymentMethods } from "../../domain/projections/selectors";
import { Fab } from "../ui/fab";
import { Modal } from "../ui/modal";
import { RegistryList } from "./registry-list";
import { type RegistryEntity, RegistryWizard } from "./registry-wizard";
import type { RegistryStore } from "./store";

export interface RegistryPageProps {
  entity: RegistryEntity;
  state: ProjectionState;
  store: RegistryStore;
}

type Record_ = CategoryRecord | PaymentMethodRecord;

/**
 * Uma composição, duas instâncias.
 *
 * Categorias e formas de pagamento têm a mesma forma — nome, cor, ícone, CRUD,
 * tela de gestão. Construídas em telas separadas, a segunda seria uma cópia da
 * primeira, e a cópia é onde a divergência mora.
 *
 * A página é dona do próprio modal e do próprio botão de criação: cadastro é
 * assunto dela, e centralizar isso no `App` faria o arquivo raiz conhecer
 * detalhes de uma feature.
 */
const COPY = {
  category: {
    title: "Categorias",
    empty: "Nenhuma categoria ainda. Toque em + para criar a primeira.",
    create: "Nova categoria",
  },
  paymentMethod: {
    title: "Formas de pagamento",
    empty: "Nenhuma forma de pagamento ainda. Toque em + para criar a primeira.",
    create: "Nova forma de pagamento",
  },
} as const;

export function RegistryPage({ entity, state, store }: RegistryPageProps) {
  const [editing, setEditing] = useState<Record_ | null>(null);
  const [composing, setComposing] = useState(false);

  const isPayment = entity === "paymentMethod";
  const items: Record_[] = isPayment ? listPaymentMethods(state) : listCategories(state);
  const copy = COPY[entity];
  const modalOpen = composing || editing !== null;

  function closeModal() {
    setComposing(false);
    setEditing(null);
  }

  function handleSubmit(draft: CategoryDraft | PaymentMethodDraft) {
    if (editing === null) {
      if (isPayment) void store.addPaymentMethod(draft as PaymentMethodDraft);
      else void store.addCategory(draft as CategoryDraft);
      closeModal();
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
    closeModal();
  }

  function handleDelete(id: Ulid) {
    if (editing?.id === id) closeModal();
    if (isPayment) void store.removePaymentMethod(id);
    else void store.removeCategory(id);
  }

  return (
    <section aria-label={copy.title}>
      <h2 class="hf-caption mt-4 text-[0.6875rem] font-semibold uppercase text-base-content/45">
        {copy.title}
      </h2>

      <RegistryList
        items={items}
        emptyHint={copy.empty}
        onEdit={setEditing}
        onDelete={handleDelete}
      />

      <Fab label={copy.create} onSelect={() => setComposing(true)} />

      <Modal
        open={modalOpen}
        title={editing === null ? copy.create : "Editar item"}
        onClose={closeModal}
      >
        {/*
          Montada só enquanto aberta, com `key` derivada do registro: trocar de
          registro remonta a wizard e os inicializadores de `useState` releem as
          props. Um `useEffect` de reset rodaria depois do DOM ficar consultável
          e sobrescreveria o que o usuário já digitou.
        */}
        {modalOpen && (
          <RegistryWizard
            key={editing?.id ?? "novo"}
            entity={entity}
            editing={editing}
            existingNames={items.map((item) => item.name)}
            onSubmit={handleSubmit}
            onCancel={closeModal}
          />
        )}
      </Modal>
    </section>
  );
}
