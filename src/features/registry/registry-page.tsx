import { useState } from "preact/hooks";
import type { TransactionKind } from "../../domain/events/transaction";
import type { Ulid } from "../../domain/ids/ulid";
import type { ProjectionState } from "../../domain/projections/apply";
import { listCategoriesFor, listPaymentMethods } from "../../domain/projections/selectors";
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
 * Vive dentro de Configurações: é manutenção, não uso diário. Criar e editar
 * acontecem aqui; a home só lança despesa e receita.
 */

const KIND_TABS = [
  { value: "expense", label: "Despesas", tone: "text-error" },
  { value: "income", label: "Receitas", tone: "text-success" },
] as const satisfies ReadonlyArray<{ value: TransactionKind; label: string; tone: string }>;

const SEGMENT =
  "hf-press rounded-field flex-1 cursor-pointer py-2 text-center text-sm font-medium " +
  "transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

const EMPTY_BY_KIND: Record<TransactionKind, string> = {
  expense: "Nenhuma categoria de despesa ainda.",
  income: "Nenhuma categoria de receita ainda.",
};

export function RegistryPage({ entity, state, store, onBack }: RegistryPageProps) {
  const [editing, setEditing] = useState<RegistryRecord | null>(null);
  const [composing, setComposing] = useState(false);
  // Despesa é o lado mais usado no dia a dia; a aba de receita existe para
  // achar Salário sem rolar a lista misturada.
  const [categoryTab, setCategoryTab] = useState<TransactionKind>("expense");

  const isPayment = entity === "paymentMethod";
  const items: RegistryRecord[] = isPayment
    ? listPaymentMethods(state)
    : listCategoriesFor(state, categoryTab);
  const copy = REGISTRY_COPY[entity];
  const emptyHint = isPayment ? copy.empty : EMPTY_BY_KIND[categoryTab];
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
        Só categorias separam por lado do lançamento. Forma de pagamento não
        tem esse eixo — o `kind` dela é tipo (pix, crédito…), não receita/despesa.
      */}
      {!isPayment && (
        <fieldset class="mt-3">
          <legend class="sr-only">Lado do lançamento</legend>
          <div class="rounded-field flex gap-1.5 bg-base-200 p-1">
            {KIND_TABS.map(({ value, label, tone }) => (
              <label
                key={value}
                class={`${SEGMENT} ${
                  categoryTab === value ? `bg-base-100 shadow-sm ${tone}` : "text-base-content/55"
                }`}
              >
                <input
                  type="radio"
                  name="category-tab"
                  value={value}
                  checked={categoryTab === value}
                  onChange={() => setCategoryTab(value)}
                  class="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/*
        Botão no topo da lista, e não flutuante: o flutuante saiu do app inteiro.
        Aqui a criação é o caminho principal de cadastro (a home não oferece).
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
        emptyHint={emptyHint}
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
