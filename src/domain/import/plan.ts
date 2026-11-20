import { dayOfMonthClamped } from "../dates/business-day";
import { shiftMonth } from "../dates/calendar";
import { stableEntityIdV1, stableEntityIdV2 } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import { type Book, DEFAULT_BOOK } from "../model/book";
import type { Recurrence, RecurrenceDraft } from "../model/recurrence";
import type { Transaction, TransactionDraft } from "../model/transaction";
import { installmentDescription, installmentRule } from "../recurrence/installments";
import type { ParsedEntry } from "./parse";
import { normalizeDescription } from "./suggest-category";

/** Linha depois da revisão: o usuário pode ter mudado descrição, categoria e a caixa. */
export interface ReviewedEntry extends ParsedEntry {
  categoryId: Ulid | null;
  /**
   * Estimativa de série variável que esta linha confirma (ver `suggestLinks`).
   * Vinculada, a linha não vira transação nova: vira o valor real da ocorrência.
   */
  linkTo?: Ulid | null;
}

/** Linha do PDF que confirma uma estimativa em vez de criar lançamento. */
export interface ImportConfirmation {
  transactionId: Ulid;
  amountMinor: number;
  occurredOn: string;
  /**
   * A v2 da semente da linha: é o que faz reimportar o PDF não duplicar. (Antes
   * desta versão era o id v1; `classifyImport` aceita os dois.)
   */
  importKey: Ulid;
}

export interface ImportContext {
  /** Cartão da fatura, ou a forma escolhida para o extrato (pode faltar). */
  paymentMethodId: Ulid | null;
  /** 'YYYY-MM' do vencimento. */
  referenceMonth: string;
  /**
   * Conta de destino. Entra no id das contas que não são a pessoal: sem forma de
   * pagamento (`-`), o mesmo extrato importado nas duas contas daria os mesmos
   * ids, e o `insertMissing` da segunda os pularia em silêncio. Ausente e
   * `personal` não mudam o id (os já importados seguem iguais).
   */
  book?: Book;
}

export interface ImportPlan {
  transactions: { id: Ulid; draft: TransactionDraft }[];
  series: { id: Ulid; draft: RecurrenceDraft }[];
  confirmations: ImportConfirmation[];
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
 * Semente de cada linha: a da transação avulsa ou a da série da parcela.
 * Determinística é o que faz reimportar ser inofensivo — o mesmo PDF produz as
 * mesmas sementes, e a linha já gravada (inclusive a que o usuário apagou, que
 * não pode voltar) é reconhecida (`classifyImport`).
 *
 * O ordinal separa duas compras idênticas no mesmo documento (dois cafés de
 * R$ 5 no mesmo dia). Conta sobre **todas** as linhas, marcadas ou não: se
 * dependesse da caixa, desmarcar uma linha mudaria a semente da vizinha.
 */
export function importSeeds(entries: readonly ParsedEntry[], ctx: ImportContext): string[] {
  const method = ctx.paymentMethodId ?? "-";
  const salt = ctx.book === undefined || ctx.book === DEFAULT_BOOK ? "" : `${ctx.book}:`;
  const seen = new Map<string, number>();

  return entries.map((entry) => {
    const name = normalizeDescription(entry.rawDescription);
    if (entry.installment !== null) {
      const anchor = installmentAnchor(entry.date, entry.installment.k, ctx.referenceMonth);
      return `import:${salt}parcel:${method}:${name}:${entry.installment.n}:${entry.amountMinor}:${anchor}`;
    }
    const base = `import:${salt}tx:${method}:${entry.date}:${name}:${entry.amountMinor}:${entry.kind}`;
    const ordinal = seen.get(base) ?? 0;
    seen.set(base, ordinal + 1);
    return `${base}:${ordinal}`;
  });
}

/** O id v1 de cada linha: onde o app de antes gravava (e onde grava com o lugar livre). */
export function identify(entries: readonly ParsedEntry[], ctx: ImportContext): Ulid[] {
  return importSeeds(entries, ctx).map(stableEntityIdV1);
}

/**
 * - `new`: nunca importada; grava em `id` (v1 com o lugar livre, v2 com o lugar
 *   de outro fato).
 * - `imported`: já está no banco (ou foi apagada depois): não entra de novo.
 * - `maybe`: o lugar v1 é de uma linha que não casa nos campos — pode ser esta
 *   mesma, editada depois de importar, ou outro fato que a colisão do id v1
 *   engoliu. Desmarcada, mas marcável; marcada, grava em v2.
 */
export type ImportStatus = "new" | "imported" | "maybe";

export interface ImportTarget {
  status: ImportStatus;
  /** Onde a linha grava se for marcada. */
  id: Ulid;
  /** A v2 da semente: vai em `importKey` de tudo o que a linha gravar. */
  importKey: Ulid;
}

/** As tabelas onde os lugares são procurados: de preferência as inteiras, as duas contas. */
export interface ImportSlots {
  transactions: Readonly<Record<Ulid, Transaction>>;
  recurrences: Readonly<Record<Ulid, Recurrence>>;
}

const NO_SLOTS: ImportSlots = { transactions: {}, recurrences: {} };

/**
 * O que já foi importado, linha a linha (spec do id estável, §4.4). A avulsa não
 * guardava a semente — só o id —, e com a colisão do v1 o id não basta.
 *
 * Avulsa (lugar na tabela `transactions`):
 * - `importKey` v1 ou v2 da semente em alguma transação (criada por ela, ou a
 *   estimativa que ela confirmou) → `imported`;
 * - lugar v1 livre → `new` em v1;
 * - lugar v1 com avulsa de mesmos `kind`, `amountMinor`, `occurredOn` e
 *   `paymentMethodId` → `imported`, como sempre foi (inclusive apagada);
 * - senão → `maybe`, em v2.
 *
 * Parcela (lugar na tabela `recurrences`):
 * - `importKey` da série é a v2 da semente → `imported`;
 * - lugar v1 livre → `new` em v1;
 * - lugar v1 com série de mesma forma de pagamento, valor, `startOn` na âncora e
 *   mesmo `endOn` da regra → `imported` (é a série desta compra);
 * - senão → `new` em v2: a série do lugar é de outra compra, e a desta precisa
 *   nascer para as parcelas seguintes.
 *
 * Duas linhas do mesmo PDF que caem no mesmo lugar livre: a primeira fica com o
 * v1, a seguinte vai para v2 — ids repetidos derrubariam o `insertMissing`.
 * Parcelas da mesma compra (mesma semente) têm o mesmo destino.
 */
export function classifyImport(
  entries: readonly ParsedEntry[],
  ctx: ImportContext,
  slots: ImportSlots = NO_SLOTS,
): ImportTarget[] {
  const seeds = importSeeds(entries, ctx);
  const txKeys = new Set<string>();
  for (const row of Object.values(slots.transactions)) {
    if (typeof row.importKey === "string") txKeys.add(row.importKey);
  }
  const seriesKeys = new Set<string>();
  for (const row of Object.values(slots.recurrences)) {
    if (typeof row.importKey === "string") seriesKeys.add(row.importKey);
  }
  const claimedTx = new Set<Ulid>();
  const claimedSeries = new Set<Ulid>();
  const bySeed = new Map<string, ImportTarget>();

  return entries.map((entry, index) => {
    const seed = seeds[index] ?? "";
    const known = bySeed.get(seed);
    if (known !== undefined) return known;
    const v1 = stableEntityIdV1(seed);
    const v2 = stableEntityIdV2(seed);
    const at = (status: ImportStatus, id: Ulid): ImportTarget => ({ status, id, importKey: v2 });
    let target: ImportTarget;

    if (entry.installment === null) {
      const slot = slots.transactions[v1];
      if (txKeys.has(v1) || txKeys.has(v2)) target = at("imported", v1);
      else if (claimedTx.has(v1)) target = at("new", v2);
      else if (slot === undefined) target = at("new", v1);
      else if (
        slot.occurrenceKey === null &&
        slot.kind === entry.kind &&
        slot.amountMinor === entry.amountMinor &&
        slot.occurredOn === entry.date &&
        slot.paymentMethodId === ctx.paymentMethodId
      ) {
        target = at("imported", v1);
      } else target = at("maybe", v2);
      if (target.status !== "imported") claimedTx.add(target.id);
    } else {
      const anchor = installmentAnchor(entry.date, entry.installment.k, ctx.referenceMonth);
      const slot = slots.recurrences[v1];
      if (seriesKeys.has(v2)) target = at("imported", v1);
      else if (claimedSeries.has(v1)) target = at("new", v2);
      else if (slot === undefined) target = at("new", v1);
      else if (
        slot.paymentMethodId === ctx.paymentMethodId &&
        slot.amountMinor === entry.amountMinor &&
        slot.startOn === anchor &&
        slot.endOn === installmentRule(anchor, entry.installment.n).endOn
      ) {
        target = at("imported", v1);
      } else target = at("new", v2);
      if (target.status !== "imported") claimedSeries.add(target.id);
    }

    bySeed.set(seed, target);
    return target;
  });
}

/**
 * Só as linhas marcadas viram escrita; a série da parcela entra uma vez só, e a
 * linha já importada nunca (mesmo que chegue marcada). `slots` decide o id de
 * cada uma (`classifyImport`); sem ele, todas vão para o v1.
 */
export function planImport(
  entries: readonly ReviewedEntry[],
  ctx: ImportContext,
  slots: ImportSlots = NO_SLOTS,
): ImportPlan {
  const targets = classifyImport(entries, ctx, slots);
  const plan: ImportPlan = { transactions: [], series: [], confirmations: [] };
  const seriesIds = new Set<Ulid>();

  entries.forEach((entry, index) => {
    const target = targets[index];
    if (!entry.selected || target === undefined || target.status === "imported") return;
    const { id, importKey } = target;
    const description = entry.description.trim() || entry.rawDescription;

    if (entry.installment === null && entry.linkTo != null) {
      plan.confirmations.push({
        transactionId: entry.linkTo,
        amountMinor: entry.amountMinor,
        occurredOn: entry.date,
        importKey,
      });
      return;
    }

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
          importKey,
        },
      });
      return;
    }

    if (seriesIds.has(id)) return;
    seriesIds.add(id);
    const { n, k } = entry.installment;
    const anchor = installmentAnchor(entry.date, k, ctx.referenceMonth);
    // A mesma regra do parcelamento feito no formulário: as duas origens têm de
    // gerar a mesma série para a mesma compra.
    const rule = installmentRule(anchor, n);
    plan.series.push({
      id,
      draft: {
        kind: entry.kind,
        description: installmentDescription(description, n),
        amountMinor: entry.amountMinor,
        currency: "BRL",
        categoryId: entry.categoryId,
        paymentMethodId: ctx.paymentMethodId,
        cashbackMinor: null,
        frequency: rule.frequency,
        scheduleType: rule.scheduleType,
        scheduleN: rule.scheduleN,
        startOn: anchor,
        endOn: rule.endOn,
        active: true,
        importKey,
      },
    });
  });

  return plan;
}
