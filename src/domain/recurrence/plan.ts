import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { TransactionDraft } from "../model/transaction";
import { eachPeriod, occurrenceKey, occurrenceOn } from "./schedule";

export interface OccurrencePlan {
  /** Determinístico: dois aparelhos materializam o mesmo mês com o mesmo id. */
  entityId: Ulid;
  draft: TransactionDraft;
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

      plans.push({
        entityId,
        draft: {
          kind: series.kind,
          description: series.description,
          amountMinor: series.amountMinor,
          currency: "BRL",
          categoryId: series.categoryId,
          paymentMethodId: series.paymentMethodId,
          cashbackMinor: series.cashbackMinor,
          occurredOn,
          recurrenceId: series.id,
          occurrenceKey: key,
        },
      });
    }
  }

  return plans;
}
