import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { Recurrence } from "../model/recurrence";
import type { Transaction, TransactionDraft } from "../model/transaction";
import { offersCashback } from "../transactions/cashback";
import { type AdjustmentInput, type AdjustmentPlan, planAdjustment } from "./adjust-plan";
import { adjustmentsOf, amountFor } from "./adjustments";
import { isKnownFrequency, occurrenceOn, periodOfKey, stepPeriod } from "./schedule";

/**
 * Campos que a série guarda e a materialização copia para cada ocorrência. O
 * valor fica de fora: ele muda por reajuste, nunca reescrevendo a série.
 */
export const SERIES_FIELDS = [
  "kind",
  "description",
  "categoryId",
  "paymentMethodId",
  "cashbackMinor",
] as const;
export type SeriesField = (typeof SERIES_FIELDS)[number];

/** O que a edição pode levar à série: os campos copiados e o valor. */
export type SeriesEditField = SeriesField | "amountMinor";

export type SeriesPatch = Partial<Pick<Recurrence, SeriesField>>;

export interface SeriesEditPlan {
  /** A série como foi lida: `updatedAt` é a versão esperada na gravação. */
  series: Recurrence;
  /** Competência da ocorrência editada. */
  period: string;
  /** Campos da série que mudaram nesta edição, na ordem de `SERIES_FIELDS` e valor por último. */
  fields: SeriesEditField[];
  /** Só os campos copiados que mudaram, com o valor novo. */
  seriesPatch: SeriesPatch;
  /** Reajuste a gravar, ou null quando o valor não mudou (ou já é o vigente). */
  adjustment: AdjustmentInput | null;
  adjustmentPlan: AdjustmentPlan | null;
  /** A ocorrência editada com o rascunho mesclado; `updatedAt` ainda é o lido. */
  transaction: Transaction;
  /** Ocorrências já lançadas depois desta, com os campos novos; `updatedAt` ainda é o lido. */
  following: Transaction[];
  /** Próximas que mudariam, mas foram editadas à mão no campo: ficam como estão. */
  kept: Transaction[];
}

function byDate(a: Transaction, b: Transaction): number {
  return a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0;
}

/**
 * Rascunho sem `userId` (autoria não é campo de formulário, nem por cast) e sem
 * `undefined`: um campo ausente no rascunho não pode apagar a coluna da linha.
 */
function cleanDraft(draft: TransactionDraft): Partial<Transaction> {
  const clean: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(draft)) {
    if (field === "userId" || value === undefined) continue;
    clean[field] = value;
  }
  return clean as Partial<Transaction>;
}

/** Existe competência depois desta dentro de `endOn`? Sem isso a pergunta seria vazia. */
function hasNext(series: Recurrence, period: string): boolean {
  if (series.endOn === null) return true;
  if (!isKnownFrequency(series.frequency)) return false;
  const next = stepPeriod(series.frequency, period);
  return occurrenceOn(next, series.scheduleType, series.scheduleN) <= series.endOn;
}

interface Origin {
  current: Transaction;
  series: Recurrence;
  period: string;
}

/**
 * A ocorrência viva e a série dela, quando "este e os próximos" é possível: série
 * viva, ativa, de frequência conhecida e com competência depois desta.
 */
function originOf(state: AppState, transactionId: Ulid): Origin | null {
  const current = state.transactions[transactionId];
  if (!isAlive(current) || current.recurrenceId === null || current.occurrenceKey === null) {
    return null;
  }
  const series = state.recurrences[current.recurrenceId];
  if (!isAlive(series) || series.active !== true) return null;
  if (!isKnownFrequency(series.frequency)) return null;
  const period = periodOfKey(current.occurrenceKey);
  if (!hasNext(series, period)) return null;
  return { current, series, period };
}

/**
 * Se a edição desta ocorrência pode virar "este e os próximos", seja qual for o
 * campo mudado. O formulário usa para avisar antes de o usuário salvar.
 */
export function canEditFollowing(state: AppState, transactionId: Ulid): boolean {
  return originOf(state, transactionId) !== null;
}

/**
 * O que "este e os próximos" faria ao salvar `draft` na ocorrência
 * `transactionId`. Puro: o formulário usa para decidir se pergunta e a store
 * para gravar, e os dois têm de ver o mesmo plano.
 *
 * Null quando não há o que perguntar: lançamento avulso, série apagada, pausada
 * ou de frequência desconhecida, última ocorrência de série com data final, ou
 * nenhum campo da série mudou nesta edição.
 *
 * Só o que mudou **nesta edição** (rascunho × linha) vai para a série. Comparar
 * com a série faria uma edição à mão antiga desta ocorrência vazar para os
 * meses seguintes sem o usuário ter mexido nela agora.
 *
 * As próximas já lançadas seguem a regra do reajuste, campo a campo: só muda o
 * campo que ainda tem o valor antigo da série; o que difere foi decisão do
 * usuário naquele mês e fica.
 */
export function planSeriesEdit(
  state: AppState,
  transactionId: Ulid,
  draft: TransactionDraft,
): SeriesEditPlan | null {
  const origin = originOf(state, transactionId);
  if (origin === null) return null;
  const { current, series, period } = origin;

  const seriesPatch: SeriesPatch = {};
  for (const field of SERIES_FIELDS) {
    if (draft[field] !== current[field]) {
      (seriesPatch as Record<SeriesField, unknown>)[field] = draft[field];
    }
  }
  // Na variável o valor é a média das confirmadas: trocá-lo é confirmar o mês.
  // Na fixa, voltar ao valor que a série já prevê para a competência não muda a
  // série, e um reajuste igual ao vigente seria uma linha a mais sem efeito.
  const adjustments = adjustmentsOf(state, series.id);
  const amountChanged =
    series.variable !== true &&
    draft.amountMinor !== current.amountMinor &&
    amountFor(series, adjustments, period) !== draft.amountMinor;
  const fields: SeriesEditField[] = [
    ...SERIES_FIELDS.filter((field) => field in seriesPatch),
    ...(amountChanged ? (["amountMinor"] as const) : []),
  ];
  if (fields.length === 0) return null;

  // A mesma limpeza do formulário: forma de pagamento ou tipo que não comportam
  // cashback não deixam um valor pendurado na série.
  const methodKind = (id: Ulid | null) =>
    id === null ? null : (state.paymentMethods[id]?.kind ?? null);
  const touchesCashbackRule = "kind" in seriesPatch || "paymentMethodId" in seriesPatch;
  const nextKind = seriesPatch.kind ?? series.kind;
  const nextMethod =
    "paymentMethodId" in seriesPatch
      ? (seriesPatch.paymentMethodId ?? null)
      : series.paymentMethodId;
  if (touchesCashbackRule && !offersCashback(methodKind(nextMethod), nextKind)) {
    seriesPatch.cashbackMinor = null;
  }

  const adjustment: AdjustmentInput | null = amountChanged
    ? { recurrenceId: series.id, fromPeriod: period, amountMinor: draft.amountMinor }
    : null;
  const adjustmentPlan = adjustment === null ? null : planAdjustment(state, adjustment);
  const newAmounts = new Map(
    (adjustmentPlan?.updates ?? []).map(({ transaction, amountMinor }) => [
      transaction.id,
      amountMinor,
    ]),
  );
  const keptIds = new Set((adjustmentPlan?.kept ?? []).map((row) => row.id));

  const following: Transaction[] = [];
  const kept: Transaction[] = [];
  for (const row of Object.values(state.transactions)) {
    if (!isAlive(row) || row.id === current.id || row.recurrenceId !== series.id) continue;
    if (row.occurrenceKey === null || periodOfKey(row.occurrenceKey) <= period) continue;

    const next: Transaction = { ...row };
    let handEdited = keptIds.has(row.id);
    for (const field of SERIES_FIELDS) {
      if (!(field in seriesPatch)) continue;
      const value = seriesPatch[field];
      if (row[field] === value) continue;
      if (row[field] === series[field]) (next as Record<SeriesField, unknown>)[field] = value;
      else if (field !== "cashbackMinor") handEdited = true;
    }
    if (touchesCashbackRule && !offersCashback(methodKind(next.paymentMethodId), next.kind)) {
      next.cashbackMinor = null;
    }
    const amount = newAmounts.get(row.id);
    if (amount !== undefined) next.amountMinor = amount;

    const changed = (Object.keys(next) as (keyof Transaction)[]).some(
      (key) => next[key] !== row[key],
    );
    if (changed) following.push(next);
    if (handEdited) kept.push(row);
  }
  following.sort(byDate);
  kept.sort(byDate);

  return {
    series,
    period,
    fields,
    seriesPatch,
    adjustment,
    adjustmentPlan,
    transaction: { ...current, ...cleanDraft(draft) },
    following,
    kept,
  };
}
