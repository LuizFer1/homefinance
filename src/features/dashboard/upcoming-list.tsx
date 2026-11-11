import type { AppState } from "../../domain/model/app-state";
import { daysBetween, shortDate } from "../../domain/projections/periods";
import { findCategory } from "../../domain/projections/selectors";
import type { UpcomingOccurrence } from "../../domain/recurrence/upcoming";
import { brl, signedBRL } from "../ui/money";
import { IconTile } from "../ui/tile";

/** Quantas recorrentes o bloco mostra antes do "Ver todas". */
export const UPCOMING_PREVIEW = 3;

export interface UpcomingListProps {
  items: UpcomingOccurrence[];
  state: AppState;
  today: string;
}

/**
 * Recorrentes a caminho, uma por linha de 56px.
 *
 * Despesa vai **sem sinal** e receita com "+" e verde: numa lista em que quase
 * tudo é saída, o menos em toda linha não informava nada, e junto do til da
 * estimativa (`~−R$`) era lido como dois tis.
 */
export function UpcomingList({ items, state, today }: UpcomingListProps) {
  return (
    <ul>
      {items.map((item, index) => {
        const category = findCategory(state, item.categoryId);
        const income = item.kind === "income";
        const inDays = daysBetween(today, item.date);
        return (
          <li
            key={`${item.recurrenceId}-${item.date}`}
            class="relative flex h-14 items-center gap-3"
          >
            {index > 0 && (
              <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-11" />
            )}
            <IconTile
              icon={category?.icon ?? "repeat"}
              color={category?.color ?? null}
              size={32}
              iconSize={16}
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{item.description}</span>
              <span class="block text-xs text-fg/55">
                {shortDate(item.date, today)} · em {inDays} {inDays === 1 ? "dia" : "dias"}
              </span>
            </span>
            <span
              data-testid="upcoming-amount"
              class={`hf-num text-sm font-medium ${income ? "text-income-fg" : ""}`}
            >
              {item.estimated && (
                <>
                  <span class="sr-only">aproximadamente </span>
                  <span aria-hidden="true">~</span>
                </>
              )}
              {income ? signedBRL(item.amountMinor, "always") : brl(item.amountMinor)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
