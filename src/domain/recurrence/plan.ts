import { stableEntityIdV1, stableEntityIdV2 } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { type Book, bookOf } from "../model/book";
import type { Recurrence } from "../model/recurrence";
import type { Transaction, TransactionDraft } from "../model/transaction";
import { monthOf } from "../projections/periods";
import { amountFor } from "./adjustments";
import { earliestOccurrenceAuthors, seriesAuthor } from "./author";
import { estimateFor } from "./estimate";
import { type OccurrenceIndex, type OccurrenceSlot, occurrenceIndex } from "./occurrence-index";
import { eachPeriod, occurrenceKey, occurrenceOn } from "./schedule";

export interface OccurrencePlan {
  /**
   * Determinístico: dois aparelhos materializam o mesmo mês com o mesmo id — a
   * v1 da chave com o lugar livre, a v2 quando o lugar é de outro fato.
   */
  entityId: Ulid;
  draft: TransactionDraft;
  /**
   * Estimativa de série variável: a linha nasce com `updatedAt` ancorado no
   * passado (`floorHlc`), para que a confirmação feita noutro aparelho vença
   * esta geração no LWW por linha, por mais tarde que ela aconteça.
   */
  anchored: boolean;
  /**
   * Conta da série: a ocorrência herda a do pai, e não a conta ativa. Quem grava
   * passa isto a `buildRow`; o draft do formulário nunca carrega `book`.
   */
  book: Book;
  /**
   * Autor da série (gravado ou deduzido, ver `seriesAuthor`). `null` só quando
   * não há como saber; aí quem materializa usa o usuário do aparelho.
   */
  userId: Ulid | null;
}

/** Competência vencida, sem linha, cujo lugar v1 é de outro fato (spec do id estável, §6). */
export interface LostOccurrence extends OccurrencePlan {
  series: Recurrence;
  period: string;
  /**
   * Só na chave que o reparo de duplicatas e uma exclusão da v1 deixaram sem
   * linha viva (`mergedOrphans`): a v2 que o reparo apagou e a v1 apagada depois.
   * A resposta regrava essa v2 (as linhas existem), em vez de criar.
   */
  merged?: MergedPair | null;
}

export interface MergedPair {
  /** A v2, tombstone do reparo (`mergedInto` = id da v1), como foi lida. */
  tombstone: Transaction;
  /** A v1, apagada, como foi lida. */
  keeper: Transaction;
}

/**
 * Quais ocorrências vencidas ainda não têm linha. Puro: `today` entra por
 * parâmetro e ninguém grava nada aqui.
 *
 * "Não tem linha" é pela chave, não pelo id (`occurrenceIndex`), e inclui a
 * linha apagada: com exclusão lógica a ocorrência que o usuário apagou continua
 * na tabela com `deletedAt`, e tratá-la como ausente faria o salário apagado
 * voltar no próximo boot.
 *
 * Onde gravar (spec do id estável, §4.2): lugar v1 livre → v1, igual ao app
 * velho (inclusive série nova com `startOn` no passado). Lugar v1 de outro fato
 * → v2, **só** se a competência é do mês de `today` em diante. Competência
 * passada nesse caso é pulada, como sempre foi: pode ser uma perda antiga da
 * colisão, e recriá-la sozinho mudaria meses fechados e dobraria o que a pessoa
 * lançou à mão. Só a folha de recuperação (`lostOccurrences`) a grava, depois de
 * perguntar. A guarda mora aqui, e não na folha, para nada passado nascer em v2
 * mesmo sem ela.
 *
 * `index` é o da tabela inteira quando quem chama planeja uma conta por vez: o
 * lugar v1 pode ser da outra conta, e as reservas de id do lote (`claim`) valem
 * para as duas.
 */
export function planOccurrences(
  state: AppState,
  today: string,
  index: OccurrenceIndex = occurrenceIndex(state.transactions),
): OccurrencePlan[] {
  const plans: OccurrencePlan[] = [];
  const thisMonth = monthOf(today);
  walkDue(state, today, index, (due) => {
    let entityId: Ulid;
    if (due.slot === "free") entityId = stableEntityIdV1(due.key);
    else if (monthOf(due.occurredOn) >= thisMonth) entityId = stableEntityIdV2(due.key);
    else return;
    const plan = due.plan(entityId);
    index.claim(entityId, due.series.id, due.key, plan.book);
    plans.push(plan);
  });
  return plans;
}

/**
 * As candidatas da folha de recuperação: competência de mês **passado**, sem
 * linha pela chave (viva ou apagada), com o lugar v1 de **outro** fato — nunca o
 * ambíguo, que o índice já conta como gravado. Exatamente o que a guarda de
 * `planOccurrences` pula. Não depende de data de publicação nem de versão: dois
 * aparelhos com o mesmo estado acham as mesmas. O id é sempre a v2 da chave.
 */
export function lostOccurrences(
  state: AppState,
  today: string,
  index: OccurrenceIndex = occurrenceIndex(state.transactions),
): LostOccurrence[] {
  const lost: LostOccurrence[] = [];
  const thisMonth = monthOf(today);
  walkDue(state, today, index, (due) => {
    if (due.slot !== "other" || monthOf(due.occurredOn) >= thisMonth) return;
    lost.push({
      ...due.plan(stableEntityIdV2(due.key)),
      series: due.series,
      period: due.period,
    });
  });
  return lost;
}

interface DueOccurrence {
  series: Recurrence;
  period: string;
  key: string;
  occurredOn: string;
  slot: OccurrenceSlot;
  plan: (entityId: Ulid) => OccurrencePlan;
}

function byId(a: { id: Ulid }, b: { id: Ulid }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Cada competência vencida de cada série ativa que o índice não conhece. Séries
 * em ordem de id e competências em ordem de data: dois aparelhos com o mesmo
 * estado dão o lugar v1 livre à mesma chave quando duas o disputam no mesmo lote.
 */
function walkDue(
  state: AppState,
  today: string,
  index: OccurrenceIndex,
  visit: (due: DueOccurrence) => void,
): void {
  const adjustments = Object.values(state.recurrenceAdjustments);
  const transactions = Object.values(state.transactions);
  const earliest = earliestOccurrenceAuthors(transactions);

  for (const series of Object.values(state.recurrences).sort(byId)) {
    if (series.deletedAt !== null || !series.active) continue;
    if (series.startOn === "" || series.startOn > today) continue;

    const userId = seriesAuthor(series, earliest);
    const book = bookOf(series);
    const until = series.endOn !== null && series.endOn < today ? series.endOn : today;

    for (const period of eachPeriod(series.startOn, until, series.frequency)) {
      const occurredOn = occurrenceOn(period, series.scheduleType, series.scheduleN);
      if (occurredOn > today) continue;
      if (series.endOn !== null && occurredOn > series.endOn) continue;

      const key = occurrenceKey(series.id, period);
      // A linha pode existir apagada (o usuário removeu a ocorrência): não
      // recriar é a regra, não um detalhe — recriar traria de volta um
      // lançamento que o usuário decidiu que não existe.
      if (index.knows(series.id, key, book)) continue;

      const variable = series.variable === true;
      visit({
        series,
        period,
        key,
        occurredOn,
        slot: index.slot(key),
        plan: (entityId) => ({
          entityId,
          anchored: variable,
          book,
          userId,
          draft: {
            kind: series.kind,
            description: series.description,
            // O valor da competência, não o da série: um reajuste a partir de
            // janeiro tem que fazer o salário de janeiro nascer com o valor novo.
            // Na variável, a média das confirmadas — congelada aqui: confirmar
            // outra ocorrência depois não a recalcula.
            amountMinor: variable
              ? estimateFor(series, transactions, period)
              : amountFor(series, adjustments, period),
            currency: "BRL",
            categoryId: series.categoryId,
            paymentMethodId: series.paymentMethodId,
            cashbackMinor: series.cashbackMinor,
            occurredOn,
            recurrenceId: series.id,
            occurrenceKey: key,
            ...(variable ? { estimated: true } : {}),
          },
        }),
      });
    }
  }
}
