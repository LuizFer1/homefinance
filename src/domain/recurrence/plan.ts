import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { TransactionDraft } from "../model/transaction";
import { amountFor } from "./adjustments";
import { estimateFor } from "./estimate";
import { eachPeriod, occurrenceKey, occurrenceOn } from "./schedule";

export interface OccurrencePlan {
  /** Determinístico: dois aparelhos materializam o mesmo mês com o mesmo id. */
  entityId: Ulid;
  draft: TransactionDraft;
  /**
   * Estimativa de série variável: a linha nasce com `updatedAt` ancorado no
   * passado (`floorHlc`), para que a confirmação feita noutro aparelho vença
   * esta geração no LWW por linha, por mais tarde que ela aconteça.
   */
  anchored: boolean;
}

/**
 * Quais ocorrências vencidas ainda não têm linha. Puro: `today` entra por
 * parâmetro e ninguém grava nada aqui.
 *
 * "Não tem linha" inclui a linha apagada. Com exclusão lógica a ocorrência que
 * o usuário apagou continua na tabela com `deletedAt`; tratá-la como ausente
 * faria o salário apagado voltar no próximo boot.
 */
export function planOccurrences(state: AppState, today: string): OccurrencePlan[] {
  const plans: OccurrencePlan[] = [];

  const adjustments = Object.values(state.recurrenceAdjustments);
  const transactions = Object.values(state.transactions);

  for (const series of Object.values(state.recurrences)) {
    if (series.deletedAt !== null || !series.active) continue;
    if (series.startOn === "" || series.startOn > today) continue;

    const until = series.endOn !== null && series.endOn < today ? series.endOn : today;

    for (const period of eachPeriod(series.startOn, until, series.frequency)) {
      const occurredOn = occurrenceOn(period, series.scheduleType, series.scheduleN);
      if (occurredOn > today) continue;
      if (series.endOn !== null && occurredOn > series.endOn) continue;

      const key = occurrenceKey(series.id, period);
      const entityId = stableEntityId(key);
      // A linha pode existir apagada (o usuário removeu a ocorrência): não
      // recriar é a regra, não um detalhe — recriar traria de volta um
      // lançamento que o usuário decidiu que não existe.
      if (state.transactions[entityId] !== undefined) continue;

      const variable = series.variable === true;
      plans.push({
        entityId,
        anchored: variable,
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
      });
    }
  }

  return plans;
}
