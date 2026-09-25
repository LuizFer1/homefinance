import { buildRow } from "../../data/repository";
import type { ImportPlan } from "../../domain/import/plan";
import type { Recurrence } from "../../domain/model/recurrence";
import type { Transaction } from "../../domain/model/transaction";
import type { RecurrenceStore } from "../recurrence/store";
import { describeError, type Session } from "../session/session";

export interface ImportResult {
  /** Linhas novas, avulsas mais parcelas materializadas agora. */
  transactions: number;
  series: number;
}

export interface ImportStore {
  commit: (plan: ImportPlan, today: string) => Promise<ImportResult>;
}

/**
 * Grava o plano revisado.
 *
 * Tudo por `insertMissing`, nunca `putRows`: os ids são determinísticos, e o
 * que já existe — importado antes ou apagado depois — não pode ser
 * sobrescrito nem ressuscitado. É isso que torna reimportar o mesmo PDF, ou
 * uma fatura com a parcela seguinte, inofensivo.
 *
 * As duas tabelas não são atômicas entre si. Não precisam: as duas escritas são
 * idempotentes, e uma importação interrompida se completa importando de novo.
 */
export function createImportStore(session: Session, recurrence: RecurrenceStore): ImportStore {
  return {
    async commit(plan, today) {
      let transactions = 0;
      let series = 0;
      try {
        const clock = session.clock();
        const userId = session.localUserId.value;

        if (plan.transactions.length > 0) {
          const rows = plan.transactions.map(({ id, draft }) =>
            buildRow<Transaction>(clock, { ...draft, userId }, id),
          );
          transactions = (await session.insertMissing("transactions", rows)).length;
        }

        if (plan.series.length > 0) {
          const rows = plan.series.map(({ id, draft }) => buildRow<Recurrence>(clock, draft, id));
          series = (await session.insertMissing("recurrences", rows)).length;
        }
      } catch (cause) {
        session.error.value = describeError(cause);
        throw cause;
      }

      // Mesmo sem série nova: a fatura do mês seguinte traz uma parcela de
      // uma série que já existe, e é esta chamada que a faz vencer hoje.
      if (plan.series.length > 0) {
        const before = Object.keys(session.state.value.transactions).length;
        // As parcelas vencidas nascem aqui, pelo mesmo caminho do boot: a
        // série é só uma recorrência, e a parcela, uma ocorrência dela.
        await recurrence.materializeDue(today);
        transactions += Object.keys(session.state.value.transactions).length - before;
      }

      return { transactions, series };
    },
  };
}
