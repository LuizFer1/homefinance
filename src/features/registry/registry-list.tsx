import type { Category } from "../../domain/model/category";
import type { PaymentMethod } from "../../domain/model/payment-method";
import { Icon } from "../icons/icon";
import { IconTile } from "../ui/tile";

type Item = Category | PaymentMethod;

export interface RegistryListProps {
  items: Item[];
  emptyHint: string;
  onEdit: (item: Item) => void;
  /** Linha de meta sob o nome ("9 lançamentos no mês", "Crédito"). */
  meta?: (item: Item) => string;
  /** Tag opcional ao lado da meta ("cashback" em crédito e débito). */
  tag?: (item: Item) => string | null;
}

/**
 * Lista de cadastro: a linha inteira é tocável e abre a edição, onde fica o
 * excluir.
 *
 * Os botões "Editar" e "Excluir" por linha saíram: davam ao destrutivo o mesmo
 * peso visual do inócuo e comiam a largura do nome num celular.
 */
export function RegistryList({ items, emptyHint, onEdit, meta, tag }: RegistryListProps) {
  if (items.length === 0) {
    return (
      <p class="mt-4 rounded-lg border border-dashed border-neutral-800 p-6 text-center text-sm text-fg/55">
        {emptyHint}
      </p>
    );
  }

  return (
    <ul class="mt-4 overflow-hidden rounded-lg bg-surface">
      {items.map((item, index) => {
        const label = tag?.(item) ?? null;
        const detail = meta?.(item) ?? "";

        return (
          <li key={item.id} class="relative">
            {index > 0 && (
              <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-[64px]" />
            )}
            <button
              type="button"
              aria-label={`Editar ${item.name}`}
              onClick={() => onEdit(item)}
              class="hf-press flex h-[60px] w-full items-center gap-3 px-4 text-left hover:bg-fg/[0.04]"
            >
              <IconTile icon={item.icon} color={item.color} size={36} iconSize={18} />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px]">{item.name}</span>
                {(detail !== "" || label !== null) && (
                  <span class="mt-0.5 flex items-center gap-1.5 text-xs text-fg/50">
                    {detail !== "" && <span class="truncate">{detail}</span>}
                    {label !== null && (
                      <span class="inline-flex shrink-0 items-center gap-1 rounded bg-accent-900 px-1.5 py-0.5 text-[10px] font-medium text-accent-300">
                        <Icon name="coins" size={10} />
                        {label}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <Icon name="caret-right" size={16} class="text-fg/40" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
