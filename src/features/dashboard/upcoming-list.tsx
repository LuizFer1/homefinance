import {
  INVOICE_WARNING_PERCENT,
  type UpcomingInvoice,
} from "../../domain/cards/upcoming-invoices";
import type { AppState } from "../../domain/model/app-state";
import { daysBetween, shortDate } from "../../domain/projections/periods";
import { findCategory } from "../../domain/projections/selectors";
import type { UpcomingOccurrence } from "../../domain/recurrence/upcoming";
import { brl, signedBRL } from "../ui/money";
import { IconTile } from "../ui/tile";

/** Quantas saídas o bloco mostra antes do "Ver todas". */
export const UPCOMING_PREVIEW = 3;

export interface UpcomingListProps {
  /** Faturas a vencer: vêm antes das recorrentes (costumam ser a maior saída do mês). */
  invoices?: UpcomingInvoice[];
  items: UpcomingOccurrence[];
  state: AppState;
  today: string;
}

function inDaysText(today: string, date: string): string {
  const days = daysBetween(today, date);
  return days === 0 ? "hoje" : `em ${days} ${days === 1 ? "dia" : "dias"}`;
}

function Approx() {
  return (
    <>
      <span class="sr-only">aproximadamente </span>
      <span aria-hidden="true">~</span>
    </>
  );
}

/**
 * Fatura a vencer. A aberta ainda recebe compras: o valor leva "~"; a fechada é o
 * número certo. A frase final repete que a fatura **já está nas despesas** — é o
 * dinheiro que precisa estar na conta, não um gasto novo — e a parte da renda passa
 * a atenção acima de 30%.
 */
function InvoiceRow({
  invoice,
  today,
  ruled,
}: {
  invoice: UpcomingInvoice;
  today: string;
  ruled: boolean;
}) {
  const open = invoice.status === "open";
  const heavy = invoice.incomePercent !== null && invoice.incomePercent > INVOICE_WARNING_PERCENT;
  return (
    <li data-testid="upcoming-invoice" class="relative py-3">
      {ruled && <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-11" />}
      <div class="flex items-center gap-3">
        <IconTile icon={invoice.icon} color={invoice.color} size={32} iconSize={16} />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">Fatura {invoice.cardName}</span>
          <span data-testid="invoice-when" class="block text-xs text-fg/55">
            vence {shortDate(invoice.dueOn, today)} · {inDaysText(today, invoice.dueOn)} ·{" "}
            {open ? "fatura aberta" : "fatura fechada"}
          </span>
        </span>
        <span data-testid="invoice-amount" class="hf-num text-sm font-medium">
          {open && <Approx />}
          {brl(invoice.totalMinor)}
        </span>
      </div>
      <p data-testid="invoice-note" class="mt-1 ml-11 text-xs text-fg/55 text-pretty">
        {invoice.incomePercent !== null && (
          <>
            <span class={heavy ? "font-medium text-warning" : ""}>
              {invoice.incomePercent}% da renda.
            </span>{" "}
          </>
        )}
        Já está nas despesas: é o dinheiro que precisa estar na conta no vencimento.
      </p>
    </li>
  );
}

/**
 * Próximas saídas: faturas a vencer e recorrentes a caminho, uma por linha.
 *
 * Despesa vai **sem sinal** e receita com "+" e verde: numa lista em que quase
 * tudo é saída, o menos em toda linha não informava nada, e junto do til da
 * estimativa (`~−R$`) era lido como dois tis.
 */
export function UpcomingList({ invoices = [], items, state, today }: UpcomingListProps) {
  return (
    <ul>
      {invoices.map((invoice, index) => (
        <InvoiceRow
          key={`${invoice.cardId}-${invoice.month}`}
          invoice={invoice}
          today={today}
          ruled={index > 0}
        />
      ))}
      {items.map((item, index) => {
        const category = findCategory(state, item.categoryId);
        const income = item.kind === "income";
        return (
          <li
            key={`${item.recurrenceId}-${item.date}`}
            class="relative flex h-14 items-center gap-3"
          >
            {index + invoices.length > 0 && (
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
                {shortDate(item.date, today)} · {inDaysText(today, item.date)}
              </span>
            </span>
            <span
              data-testid="upcoming-amount"
              class={`hf-num text-sm font-medium ${income ? "text-income-fg" : ""}`}
            >
              {item.estimated && <Approx />}
              {income ? signedBRL(item.amountMinor, "always") : brl(item.amountMinor)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
