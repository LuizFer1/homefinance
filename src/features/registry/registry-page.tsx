import { useState } from "preact/hooks";
import type { Ulid } from "../../domain/ids/ulid";
import type { ProjectionState } from "../../domain/projections/apply";
import { listCategories, listPaymentMethods } from "../../domain/projections/selectors";
import { REGISTRY_COPY, RegistryFormModal, type RegistryRecord } from "./registry-form-modal";
import { RegistryList } from "./registry-list";
import type { RegistryEntity } from "./registry-wizard";
import type { RegistryStore } from "./store";

export interface RegistryPageProps {
  entity: RegistryEntity;
  state: ProjectionState;
  store: RegistryStore;
  onBack: () => void;
}

/**
 * Uma composição, duas instâncias.
 *
 * Categorias e formas de pagamento têm a mesma forma — nome, cor, ícone, CRUD,
 * tela de gestão. Construídas em telas separadas, a segunda seria uma cópia da
 * primeira, e a cópia é onde a divergência mora.
 *
 * Vive dentro de Configurações: é manutenção, não uso diário. O caminho rápido
 * para criar está nas ações de Início.
 */
export function RegistryPage({ entity, state, store, onBack }: RegistryPageProps) {
  const [editing, setEditing] = useState<RegistryRecord | null>(null);
  const [composing, setComposing] = useState(false);

  const isPayment = entity === "paymentMethod";
  const items: RegistryRecord[] = isPayment ? listPaymentMethods(state) : listCategories(state);
  const copy = REGISTRY_COPY[entity];
  const modalOpen = composing || editing !== null;

  function closeModal() {
    setComposing(false);
    setEditing(null);
  }

  function handleDelete(id: Ulid) {
    if (editing?.id === id) closeModal();
    if (isPayment) void store.removePaymentMethod(id);
    else void store.removeCategory(id);
  }

  return (
    <section aria-label={copy.title}>
      <div class="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar para configurações"
          class="hf-press rounded-field px-2 py-1 text-base-content/55"
        >
          &lsaquo;
        </button>
        <h2 class="hf-caption text-[0.6875rem] font-semibold uppercase text-base-content/45">
          {copy.title}
        </h2>
      </div>

      {/*
        Botão no topo da lista, e não flutuante: o flutuante saiu do app inteiro,
        e aqui a criação é secundária — o caminho rápido está nas ações de Início.
      */}
      <button
        type="button"
        onClick={() => setComposing(true)}
        class="hf-press rounded-box mt-3 flex w-full items-center justify-center gap-2
          border border-dashed border-base-content/20 bg-base-100/40 py-3 text-sm
          font-medium text-base-content/70 transition-colors duration-150
          hover:border-base-content/35 hover:text-base-content"
      >
        + {copy.create}
      </button>

      <RegistryList
        items={items}
        emptyHint={copy.empty}
        onEdit={setEditing}
        onDelete={handleDelete}
      />

      <RegistryFormModal
        entity={entity}
        open={modalOpen}
        editing={editing}
        state={state}
        store={store}
        onClose={closeModal}
      />
    </section>
  );
}
