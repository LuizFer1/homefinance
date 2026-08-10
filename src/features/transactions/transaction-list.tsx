import type { Ulid } from "../../domain/ids/ulid";
import { formatBRL } from "../../domain/money/money";
import type { ProjectionState, TransactionRecord } from "../../domain/projections/apply";
import { resolveCategoryName, resolvePaymentMethodName } from "../../domain/projections/selectors";

export interface TransactionListProps {
  /** Já filtrados e ordenados por `listTransactions`. */
  items: TransactionRecord[];
  /** Para resolver categoria e forma de pagamento em texto, inclusive as apagadas. */
  state: ProjectionState;
  onEdit: (record: TransactionRecord) => void;
  onDelete: (entityId: Ulid) => void;
}

/** 'YYYY-MM-DD' -> 'DD/MM'. Numa lista do mês corrente o ano não informa nada. */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return month && day ? `${day}/${month}` : iso;
}

export function TransactionList({ items, state, onEdit, onDelete }: TransactionListProps) {
  if (items.length === 0) {
    return (
      <p class="rounded-box mt-4 border border-base-content/10 bg-base-100/60 px-4 py-10 text-center text-sm text-base-content/45">
        Nenhum lançamento ainda.
      </p>
    );
  }

  return (
    <ul class="rounded-box mt-4 divide-y divide-base-300 border border-base-content/10 bg-base-100/60">
      {items.map((item) => (
        <li key={item.id} class="flex items-stretch">
          {/*
            A linha inteira é o alvo de editar. Dois botões de texto por linha
            comiam a largura da descrição num celular e davam ao destrutivo o
            mesmo peso visual do inócuo.
          */}
          <button
            type="button"
            aria-label={`Editar ${item.description}`}
            onClick={() => onEdit(item)}
            class="hf-press flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left
              transition-colors duration-150 hover:bg-base-200/60"
          >
            <time
              dateTime={item.occurredOn}
              class="hf-num w-10 shrink-0 text-xs text-base-content/40"
            >
              {shortDate(item.occurredOn)}
            </time>

            <span class="min-w-0 flex-1">
              <span class="block truncate">{item.description}</span>
              {/*
                Segunda linha só aparece quando há o que dizer. Um "Sem
                categoria · Sem forma de pagamento" em toda linha viraria ruído
                constante e empurraria o valor, que é o dado que importa.
              */}
              {(item.categoryId !== null ||
                item.paymentMethodId !== null ||
                item.cashbackMinor !== null) && (
                <span class="mt-0.5 block truncate text-xs text-base-content/45">
                  {[
                    item.categoryId !== null ? resolveCategoryName(state, item.categoryId) : null,
                    item.paymentMethodId !== null
                      ? resolvePaymentMethodName(state, item.paymentMethodId)
                      : null,
                    item.cashbackMinor !== null
                      ? `${formatBRL(item.cashbackMinor)} de volta`
                      : null,
                  ]
                    .filter((part) => part !== null)
                    .join(" · ")}
                </span>
              )}
            </span>

            {/*
              Coluna de largura mínima e alinhada à direita: sem isso o valor
              empurra o resto e cada linha para num lugar diferente.
              Verde só na receita — num diário de gastos a despesa é a regra, e
              pintar a regra de vermelho vira ruído em vez de sinal.
            */}
            <span
              class={`hf-num shrink-0 text-right font-semibold tabular-nums ${
                item.kind === "income" ? "text-success" : "text-base-content"
              }`}
            >
              {item.kind === "income" ? "+" : "-"}
              {formatBRL(item.amountMinor)}
            </span>
          </button>

          <button
            type="button"
            aria-label={`Excluir ${item.description}`}
            onClick={() => onDelete(item.id)}
            class="hf-press flex w-11 shrink-0 items-center justify-center text-base-content/30
              transition-colors duration-150 hover:text-error"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            >
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
