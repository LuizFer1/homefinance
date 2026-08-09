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
import { type RegistryEntity, RegistryForm } from "./registry-form";
import { RegistryList } from "./registry-list";
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
 */
const COPY = {
  category: {
    title: "Categorias",
    empty: "Nenhuma categoria ainda. Crie a primeira acima.",
  },
  paymentMethod: {
    title: "Formas de pagamento",
    empty: "Nenhuma forma de pagamento ainda. Crie a primeira acima.",
  },
} as const;

export function RegistryPage({ entity, state, store }: RegistryPageProps) {
  const [editing, setEditing] = useState<Record_ | null>(null);

  const isPayment = entity === "paymentMethod";
  const items: Record_[] = isPayment ? listPaymentMethods(state) : listCategories(state);
  const copy = COPY[entity];

  function handleSubmit(draft: CategoryDraft | PaymentMethodDraft) {
    if (editing === null) {
      if (isPayment) void store.addPaymentMethod(draft as PaymentMethodDraft);
      else void store.addCategory(draft as CategoryDraft);
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
    setEditing(null);
  }

  function handleDelete(id: Ulid) {
    if (editing?.id === id) setEditing(null);
    if (isPayment) void store.removePaymentMethod(id);
    else void store.removeCategory(id);
  }

  return (
    <section aria-label={copy.title}>
      <h2 class="hf-caption text-[0.6875rem] font-semibold uppercase text-base-content/45">
        {copy.title}
      </h2>

      <RegistryForm
        key={editing?.id ?? "novo"}
        entity={entity}
        editing={editing}
        existingNames={items.map((item) => item.name)}
        onSubmit={handleSubmit}
        onCancel={() => setEditing(null)}
      />

      <RegistryList
        items={items}
        emptyHint={copy.empty}
        onEdit={setEditing}
        onDelete={handleDelete}
      />
    </section>
  );
}
