import type { Ulid } from "../../domain/ids/ulid";
import type { CategoryRecord, PaymentMethodRecord } from "../../domain/projections/apply";
import { cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";

export interface RegistryListProps {
  items: (CategoryRecord | PaymentMethodRecord)[];
  emptyHint: string;
  onEdit: (item: CategoryRecord | PaymentMethodRecord) => void;
  onDelete: (id: Ulid) => void;
}

const ACTION =
  "hf-press rounded-field px-2.5 py-1.5 text-sm text-base-content/60 " +
  "transition-colors duration-150 hover:text-base-content";

export function RegistryList({ items, emptyHint, onEdit, onDelete }: RegistryListProps) {
  if (items.length === 0) {
    return (
      <p class="rounded-box mt-4 bg-base-100 p-6 text-center text-sm text-base-content/50">
        {emptyHint}
      </p>
    );
  }

  return (
    <ul class="rounded-box mt-4 divide-y divide-base-200 bg-base-100">
      {items.map((item) => (
        <li key={item.id} class="flex items-center gap-3 px-4 py-3">
          {/*
            A cor é a âncora visual do item e vive no ícone, não no fundo da
            linha: fundo colorido em lista longa vira listra e cansa a leitura.
          */}
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-full text-base-100"
            style={{ backgroundColor: cssVarForToken(item.color) }}
          >
            <Icon name={item.icon} />
          </span>

          <span class="min-w-0 flex-1 truncate">{item.name}</span>

          <button type="button" class={ACTION} onClick={() => onEdit(item)}>
            Editar
          </button>
          <button
            type="button"
            class={`${ACTION} hover:text-error`}
            onClick={() => onDelete(item.id)}
          >
            Excluir
          </button>
        </li>
      ))}
    </ul>
  );
}
