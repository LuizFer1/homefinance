import { buildRow } from "../../data/repository";
import { confirmedImportKeys } from "../../domain/import/link";
import type { ImportPlan } from "../../domain/import/plan";
import type { Recurrence } from "../../domain/model/recurrence";
import type { Transaction } from "../../domain/model/transaction";
import type { RecurrenceStore } from "../recurrence/store";
import { describeError, type Session } from "../session/session";

export interface ImportResult {
  /** Linhas novas, avulsas mais parcelas materializadas agora. */
  transactions: number;
  series: number;
  /** Estimativas de série variável confirmadas por uma linha do PDF. */
  confirmed: number;
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
      let confirmed = 0;
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

        // Linha que já confirmou alguma ocorrência fica de fora, como o id
        // que já existe fica de fora do `insertMissing`: reimportar não pode
        // regravar a conta de luz com o valor do PDF por cima de uma edição.
        const done = confirmedImportKeys(session.state.value);
        const pending = plan.confirmations.filter((item) => !done.has(item.importKey));
        if (pending.length > 0) {
          const state = session.state.value;
          const rows: Transaction[] = [];
          const versions: Record<string, string> = {};
          for (const item of pending) {
            const current = state.transactions[item.transactionId];
            if (current === undefined || current.deletedAt !== null) {
              throw new Error("A estimativa vinculada não existe mais. Revise de novo.");
            }
            rows.push({
              ...current,
              amountMinor: item.amountMinor,
              occurredOn: item.occurredOn,
              estimated: false,
              importKey: item.importKey,
              updatedAt: clock.stamp().hlc,
              dirty: 1,
            });
            versions[current.id] = current.updatedAt;
          }
          // Regrava linhas inteiras planejadas do `state` em memória: se outra
          // aba ou o sync mexeu numa delas, recusa o lote em vez de desfazer.
          await session.putRowsIfCurrent({ transactions: rows }, { transactions: versions });
          confirmed = rows.length;
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

      return { transactions, series, confirmed };
    },
  };
}
