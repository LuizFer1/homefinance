import { useState } from "preact/hooks";
import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import type { PaymentKind } from "../../domain/model/payment-method";
import type { Transaction, TransactionKind } from "../../domain/model/transaction";
import { categoryUsage } from "../../domain/projections/insights";
import { monthOf } from "../../domain/projections/periods";
import { listCategoriesFor, listPaymentMethods } from "../../domain/projections/selectors";
import { offersCashback } from "../../domain/transactions/cashback";
import { Icon } from "../icons/icon";
import { ignoreHandled } from "../session/session";
import { PageHeader } from "../ui/page-header";
import { Segmented } from "../ui/segmented";
import { REGISTRY_COPY, RegistryFormModal, type RegistryRecord } from "./registry-form-modal";
import { RegistryList } from "./registry-list";
import { PAYMENT_KIND_LABELS, type RegistryEntity } from "./registry-wizard";
import type { RegistryStore } from "./store";

export interface RegistryPageProps {
  entity: RegistryEntity;
  state: AppState;
  /** Lançamentos visíveis, para a meta de uso no mês. */
  items: Transaction[];
  today: string;
  store: RegistryStore;
  onBack: () => void;
}

const EMPTY_BY_KIND: Record<TransactionKind, string> = {
  expense: "Nenhuma categoria de despesa ainda.",
  income: "Nenhuma categoria de receita ainda.",
};

function usageLabel(count: number): string {
  if (count === 0) return "Sem lançamentos no mês";
  return count === 1 ? "1 lançamento no mês" : `${count} lançamentos no mês`;
}

/**
 * Uma composição, duas instâncias.
 *
 * Categorias e formas de pagamento têm a mesma forma — nome, cor, ícone, CRUD,
 * tela de gestão. Construídas em telas separadas, a segunda seria uma cópia da
 * primeira, e a cópia é onde a divergência mora.
 *
 * A meta de uso no mês existe para a decisão de excluir: "Sem lançamentos no
 * mês" é o que diz que dá para apagar sem perder nada de vista.
 */
export function RegistryPage({ entity, state, items, today, store, onBack }: RegistryPageProps) {
  const [editing, setEditing] = useState<RegistryRecord | null>(null);
  const [composing, setComposing] = useState(false);
  // Despesa é o lado mais usado no dia a dia; a aba de receita existe para
  // achar Salário sem rolar a lista misturada.
  const [categoryTab, setCategoryTab] = useState<TransactionKind>("expense");

  const isPayment = entity === "paymentMethod";
  const list: RegistryRecord[] = isPayment
    ? listPaymentMethods(state)
    : listCategoriesFor(state, categoryTab);
  const copy = REGISTRY_COPY[entity];
  const emptyHint = isPayment ? copy.empty : EMPTY_BY_KIND[categoryTab];
  const modalOpen = composing || editing !== null;
  const usage = categoryUsage(items, monthOf(today), isPayment ? "paymentMethodId" : "categoryId");

  function closeModal() {
    setComposing(false);
    setEditing(null);
  }

  function handleDelete(id: Ulid) {
    closeModal();
    // A falha aparece pelo `session.error`; aqui só não deixa a rejeição solta.
    if (isPayment) void store.removePaymentMethod(id).catch(ignoreHandled);
    else void store.removeCategory(id).catch(ignoreHandled);
  }

  return (
    <section aria-label={copy.title}>
      <PageHeader
        title={isPayment ? "Pagamentos" : "Categorias"}
        onBack={onBack}
        action={
          <button
            type="button"
            aria-label={`+ ${copy.create}`}
            onClick={() => setComposing(true)}
            class="hf-press flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-accent
              bg-accent/10 px-3 text-sm font-medium text-accent-300 hover:bg-accent/20"
          >
            <Icon name="plus" size={16} />
            Nova
          </button>
        }
      />

      {/*
        Só categorias separam por lado do lançamento. Forma de pagamento não
        tem esse eixo — o `kind` dela é tipo (pix, crédito…), não receita/despesa.
      */}
      {!isPayment && (
        <Segmented
          name="category-tab"
          legend="Lado do lançamento"
          variant="pill"
          class="mt-5"
          options={[
            {
              value: "expense",
              label: `Despesas (${listCategoriesFor(state, "expense").length})`,
            },
            {
              value: "income",
              label: `Receitas (${listCategoriesFor(state, "income").length})`,
            },
          ]}
          value={categoryTab}
          onChange={setCategoryTab}
        />
      )}

      <RegistryList
        items={list}
        emptyHint={emptyHint}
        onEdit={setEditing}
        meta={(item) =>
          isPayment
            ? (PAYMENT_KIND_LABELS[item.kind as PaymentKind] ?? "Outro")
            : usageLabel(usage[item.id] ?? 0)
        }
        tag={(item) => (isPayment && offersCashback(item.kind, "expense") ? "cashback" : null)}
      />

      {isPayment && list.length > 0 && (
        <p class="mt-4 text-center text-xs text-fg/50">Toque numa forma para editar ou excluir.</p>
      )}

      <RegistryFormModal
        entity={entity}
        open={modalOpen}
        editing={editing}
        state={state}
        store={store}
        onClose={closeModal}
        onDelete={handleDelete}
      />
    </section>
  );
}
