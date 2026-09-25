import { dayOfMonthClamped } from "../dates/business-day";
import { shiftMonth } from "../dates/calendar";
import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { RecurrenceDraft } from "../model/recurrence";
import type { TransactionDraft } from "../model/transaction";
import type { ParsedEntry } from "./parse";
import { normalizeDescription } from "./suggest-category";

/** Linha depois da revisão: o usuário pode ter mudado descrição, categoria e a caixa. */
export interface ReviewedEntry extends ParsedEntry {
  categoryId: Ulid | null;
}

export interface ImportContext {
  /** Cartão da fatura, ou a forma escolhida para o extrato (pode faltar). */
  paymentMethodId: Ulid | null;
  /** 'YYYY-MM' do vencimento. */
  referenceMonth: string;
}

export interface ImportPlan {
  transactions: { id: Ulid; draft: TransactionDraft }[];
  series: { id: Ulid; draft: RecurrenceDraft }[];
}

function monthsBetween(from: string, to: string): number {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7))
  );
}

/**
 * Data da 1ª parcela.
 *
 * O comum é o banco imprimir a data original da compra em todas as parcelas —
 * aí a data da linha **é** a âncora, e ela fica a k meses ou mais do
 * vencimento. Há banco que imprime a data da parcela, colada no mês da fatura;
 * nesse caso volta-se k−1 meses. Sem isto, cada fatura desse banco geraria uma
 * série nova para a mesma compra.
 */
export function installmentAnchor(date: string, k: number, referenceMonth: string): string {
  const month = date.slice(0, 7);
  if (k < 2 || monthsBetween(month, referenceMonth) > 1) return date;
  return dayOfMonthClamped(shiftMonth(month, -(k - 1)), Number(date.slice(8, 10)));
}

/**
 * Id determinístico de cada linha: o da transação avulsa ou o da série da
 * parcela. Determinístico é o que faz reimportar ser inofensivo — o mesmo PDF
 * produz os mesmos ids, e `insertMissing` pula o que já existe (inclusive o
 * que o usuário apagou, que não pode voltar).
 *
 * O ordinal separa duas compras idênticas no mesmo documento (dois cafés de
 * R$ 5 no mesmo dia). Conta sobre **todas** as linhas, marcadas ou não: se
 * dependesse da caixa, desmarcar uma linha mudaria o id da vizinha.
 */
export function identify(entries: readonly ParsedEntry[], ctx: ImportContext): Ulid[] {
  const method = ctx.paymentMethodId ?? "-";
  const seen = new Map<string, number>();

  return entries.map((entry) => {
    const name = normalizeDescription(entry.rawDescription);
    if (entry.installment !== null) {
      const anchor = installmentAnchor(entry.date, entry.installment.k, ctx.referenceMonth);
      return stableEntityId(
        `import:parcel:${method}:${name}:${entry.installment.n}:${entry.amountMinor}:${anchor}`,
      );
    }
    const base = `import:tx:${method}:${entry.date}:${name}:${entry.amountMinor}:${entry.kind}`;
    const ordinal = seen.get(base) ?? 0;
    seen.set(base, ordinal + 1);
    return stableEntityId(`${base}:${ordinal}`);
  });
}

/** Só as linhas marcadas viram escrita; a série da parcela entra uma vez só. */
export function planImport(entries: readonly ReviewedEntry[], ctx: ImportContext): ImportPlan {
  const ids = identify(entries, ctx);
  const plan: ImportPlan = { transactions: [], series: [] };
  const seriesIds = new Set<Ulid>();

  entries.forEach((entry, index) => {
    const id = ids[index];
    if (!entry.selected || id === undefined) return;
    const description = entry.description.trim() || entry.rawDescription;

    if (entry.installment === null) {
      plan.transactions.push({
        id,
        draft: {
          kind: entry.kind,
          description,
          amountMinor: entry.amountMinor,
          currency: "BRL",
          categoryId: entry.categoryId,
          paymentMethodId: ctx.paymentMethodId,
          cashbackMinor: null,
          occurredOn: entry.date,
          recurrenceId: null,
          occurrenceKey: null,
        },
      });
      return;
    }

    if (seriesIds.has(id)) return;
    seriesIds.add(id);
    const { n, k } = entry.installment;
    const anchor = installmentAnchor(entry.date, k, ctx.referenceMonth);
    const day = Number(anchor.slice(8, 10));
    plan.series.push({
      id,
      draft: {
        kind: entry.kind,
        description: `${description} (${n}x)`,
        amountMinor: entry.amountMinor,
        currency: "BRL",
        categoryId: entry.categoryId,
        paymentMethodId: ctx.paymentMethodId,
        cashbackMinor: null,
        frequency: "monthly",
        scheduleType: "dayOfMonth",
        scheduleN: day,
        startOn: anchor,
        endOn: dayOfMonthClamped(shiftMonth(anchor.slice(0, 7), n - 1), day),
        active: true,
      },
    });
  });

  return plan;
}
