import { useState } from "preact/hooks";
import { cardDetail, isCompleteCard, listCreditCards } from "../../domain/cards/card";
import { cardInvoices, type Invoice } from "../../domain/cards/invoice";
import { pendingCardGroups } from "../../domain/cards/migration";
import type { AppState } from "../../domain/model/app-state";
import { dayMonth, monthLabelShort } from "../../domain/projections/periods";
import { brl, signedBRL } from "../ui/money";
import { PageHeader } from "../ui/page-header";
import { CardMark } from "./card-mark";

export interface InvoicesPageProps {
  state: AppState;
  today: string;
  onBack: () => void;
  /** Abre o ajuste dos cartões por completar. Sem ele, o aviso não tem ação. */
  onFixCards?: () => void;
  /** Abre o cadastro de formas de pagamento (criar o primeiro cartão). */
  onOpenPayments?: () => void;
}

function invoiceTitle(invoice: Invoice): string {
  const label = `Fatura de ${monthLabelShort(invoice.month)}`;
  return invoice.status === "open" ? `${label} · aberta` : label;
}

function InvoiceBlock({
  invoice,
  expanded,
  onToggle,
}: {
  invoice: Invoice;
  expanded: boolean;
  onToggle: () => void;
}) {
  const open = invoice.status === "open";
  return (
    <li data-testid="invoice" data-status={invoice.status} class="border-t border-divider">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        class="hf-press flex min-h-16 w-full items-center gap-3 py-3 text-left"
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[15px] font-medium">{invoiceTitle(invoice)}</span>
          <span class="mt-0.5 block truncate text-xs text-fg/55">
            Fecha {dayMonth(invoice.closesOn)} · vence {dayMonth(invoice.dueOn)}
          </span>
          {/* O valor aberto muda a cada compra e ainda não é o que o banco fecha. */}
          {open && (
            <span data-testid="invoice-estimate" class="mt-0.5 block text-xs text-tag-amber">
              Estimativa, pode mudar até o fechamento
            </span>
          )}
        </span>
        <span class="hf-num shrink-0 text-[15px] font-medium">
          {open && "~"}
          {brl(invoice.totalMinor)}
        </span>
      </button>

      {expanded && (
        <ul aria-label={`Lançamentos da ${invoiceTitle(invoice)}`} class="pb-2">
          {invoice.items.length === 0 && (
            <li class="py-2 text-sm text-fg/55">Nenhuma compra nesta fatura ainda.</li>
          )}
          {invoice.items.map((item) => {
            const refund = item.kind === "income";
            return (
              <li key={item.id} class="flex items-center gap-3 py-2">
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm">{item.description}</span>
                  <span class="mt-0.5 block text-xs text-fg/55">{dayMonth(item.occurredOn)}</span>
                </span>
                <span class={`hf-num shrink-0 text-sm ${refund ? "text-income-fg" : ""}`}>
                  {signedBRL(refund ? item.amountMinor : -item.amountMinor, "always")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * Faturas dos cartões, calculadas dos lançamentos: a aberta (rotulada como
 * estimativa) e as anteriores. Cartão por completar não tem fatura — não há
 * fechamento para decidir de qual ela é — e aparece à parte com o caminho
 * para completá-lo.
 */
export function InvoicesPage({
  state,
  today,
  onBack,
  onFixCards,
  onOpenPayments,
}: InvoicesPageProps) {
  const cards = listCreditCards(state);
  const complete = cards.filter(isCompleteCard);
  const incomplete = cards.filter((card) => !isCompleteCard(card));
  const pending = pendingCardGroups(state).reduce(
    (sum, group) => sum + group.transactions.length,
    0,
  );
  // Fatura aberta de cada cartão já nasce expandida: é a que se consulta.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [expandedClosed, setExpandedClosed] = useState<ReadonlySet<string>>(new Set());

  function keyOf(invoice: Invoice): string {
    return `${invoice.cardId}:${invoice.month}`;
  }

  function toggle(invoice: Invoice) {
    const key = keyOf(invoice);
    if (invoice.status === "open") {
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    setExpandedClosed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isExpanded(invoice: Invoice): boolean {
    const key = keyOf(invoice);
    return invoice.status === "open" ? !collapsed.has(key) : expandedClosed.has(key);
  }

  return (
    <section aria-label="Faturas">
      <PageHeader title="Faturas" onBack={onBack} />

      {pending > 0 && (
        <div
          role="status"
          data-testid="cards-pending"
          class="mt-5 rounded-lg border border-tag-amber/35 bg-tag-amber/10 p-3.5"
        >
          <p class="text-sm font-medium text-tag-amber">
            {pending === 1
              ? "1 lançamento em cartão por completar"
              : `${pending} lançamentos em cartões por completar`}
          </p>
          <p class="mt-1 text-xs text-fg/65">
            Escolha a qual cartão eles pertencem para entrarem na fatura certa.
          </p>
          {onFixCards !== undefined && (
            <button
              type="button"
              onClick={onFixCards}
              class="hf-press mt-2 text-sm font-medium text-accent-300"
            >
              Ajustar cartões
            </button>
          )}
        </div>
      )}

      {complete.length === 0 && (
        <div class="mt-6 rounded-lg bg-surface p-4">
          <p class="text-[15px] font-medium">Nenhum cartão cadastrado</p>
          <p class="mt-1 text-sm text-fg/60">
            Cadastre um cartão de crédito com banco, fechamento e vencimento para ver as faturas.
          </p>
          {onOpenPayments !== undefined && (
            <button
              type="button"
              onClick={onOpenPayments}
              class="hf-press mt-2 text-sm font-medium text-accent-300"
            >
              Cadastrar cartão
            </button>
          )}
        </div>
      )}

      {complete.map((card) => {
        const invoices = cardInvoices(state, card, today);
        return (
          <section
            key={card.id}
            aria-label={card.name}
            data-testid="card-invoices"
            class="mt-6 rounded-lg bg-surface px-4 pt-4 pb-1"
          >
            <div class="flex items-center gap-3 pb-3">
              <CardMark color={card.color} size={36} />
              <span class="min-w-0 flex-1">
                <h2 class="truncate text-[15px] font-medium">{card.name}</h2>
                <span class="mt-0.5 block truncate text-xs text-fg/55">{cardDetail(card)}</span>
              </span>
            </div>
            <ul>
              {invoices.map((invoice) => (
                <InvoiceBlock
                  key={invoice.month}
                  invoice={invoice}
                  expanded={isExpanded(invoice)}
                  onToggle={() => toggle(invoice)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {incomplete.length > 0 && (
        <p class="mt-5 text-xs text-fg/55">
          Sem fatura por falta de dados: {incomplete.map((card) => card.name).join(", ")}.
          {onOpenPayments !== undefined && (
            <>
              {" "}
              <button
                type="button"
                onClick={onOpenPayments}
                class="hf-press font-medium text-accent-300"
              >
                Completar em Pagamentos
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}
