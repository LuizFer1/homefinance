import { buildRow } from "../../data/repository";
import type { Ulid } from "../../domain/ids/ulid";
import type { Recurrence, RecurrenceDraft, RecurrenceRule } from "../../domain/model/recurrence";
import type { RecurrenceAdjustment } from "../../domain/model/recurrence-adjustment";
import type { Transaction, TransactionDraft } from "../../domain/model/transaction";
import { type AdjustmentInput, planAdjustment } from "../../domain/recurrence/adjust-plan";
import { planOccurrences } from "../../domain/recurrence/plan";
import { describeError, type ExpectedVersions, type Session } from "../session/session";

/**
 * Série de recorrência: cria a partir de um lançamento + regra, materializa o
 * que venceu e edita/remove a série (a série é uma linha como qualquer
 * outra; as ocorrências, `Transaction`s ligadas por `recurrenceId`).
 */
export interface RecurrenceStore {
  /** Cria a série a partir do lançamento + regra e materializa o que venceu. */
  createSeries: (draft: TransactionDraft, rule: RecurrenceRule, today: string) => Promise<void>;
  /** Gera as ocorrências que faltam (no boot e ao criar série). */
  materializeDue: (today: string) => Promise<void>;
  editSeries: (id: Ulid, draft: RecurrenceDraft) => Promise<Recurrence>;
  removeSeries: (id: Ulid) => Promise<Recurrence>;
  /**
   * Reajusta a série a partir de uma competência e atualiza as ocorrências já
   * lançadas que ainda seguem a série (ver `planAdjustment`).
   */
  adjustSeries: (input: AdjustmentInput) => Promise<void>;
  /** Desfaz um reajuste (exclusão lógica). Ocorrências já lançadas ficam como estão. */
  removeAdjustment: (id: Ulid) => Promise<RecurrenceAdjustment>;
}

export function createRecurrenceStore(session: Session): RecurrenceStore {
  async function materializeDue(today: string): Promise<void> {
    // Todo o corpo entra no try: `clock()` chamado antes do `init` concluir é
    // um erro de uso, mas ainda tem que preencher `error` como qualquer outra
    // falha — quem só observa o signal não pode perder o motivo.
    try {
      const plans = planOccurrences(session.state.value, today);
      if (plans.length === 0) return;

      const clock = session.clock();
      const userId = session.localUserId.value;
      // Monta as linhas fora da transação (`buildRow` não grava). O plano
      // veio do `state` em memória, que pode estar desatualizado (outra aba
      // ainda não recarregou); `insertMissing` — e não `putRows`/`bulkPut` —
      // é quem grava, porque ele nunca sobrescreve uma linha que já existe no
      // banco. Sem isso, a ocorrência que o usuário apagou nesta ou noutra
      // aba voltaria viva no próximo boot.
      const rows = plans.map((plan) =>
        buildRow<Transaction>(clock, { ...plan.draft, userId }, plan.entityId),
      );
      await session.insertMissing("transactions", rows);
    } catch (cause) {
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  async function adjustSeries(input: AdjustmentInput): Promise<void> {
    try {
      // Guarda para qualquer chamador, não só o sheet: centavo fracionário ou
      // valor fora do inteiro seguro entraria no log, que é eterno.
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error("Valor de reajuste inválido");
      }
      const state = session.state.value;
      const plan = planAdjustment(state, input);
      if (plan === null) throw new Error("Série não existe");

      const clock = session.clock();
      const existing = state.recurrenceAdjustments[plan.adjustmentId];
      // Mesma competência é a mesma linha (id determinístico), inclusive uma
      // apagada: refazer o reajuste de janeiro é o mesmo fato, e criar outra
      // linha com o mesmo id derrubaria o lote.
      const adjustment: RecurrenceAdjustment =
        existing === undefined
          ? buildRow<RecurrenceAdjustment>(
              clock,
              {
                recurrenceId: input.recurrenceId,
                fromPeriod: input.fromPeriod,
                amountMinor: input.amountMinor,
              },
              plan.adjustmentId,
            )
          : {
              ...existing,
              amountMinor: input.amountMinor,
              deletedAt: null,
              updatedAt: clock.stamp().hlc,
              dirty: 1,
            };
      const transactions: Transaction[] = plan.updates.map(({ transaction, amountMinor }) => ({
        ...transaction,
        amountMinor,
        updatedAt: clock.stamp().hlc,
        dirty: 1,
      }));

      // O plano veio do `state` em memória, que pode estar velho: se outra
      // aba apagou ou editou à mão uma dessas ocorrências (ou mexeu no
      // reajuste) depois do boot, gravar as linhas inteiras desfaria isso.
      // Cada linha só é regravada se ainda estiver na versão que foi lida.
      const expected: ExpectedVersions = {
        recurrenceAdjustments: { [plan.adjustmentId]: existing?.updatedAt ?? null },
        transactions: Object.fromEntries(
          plan.updates.map(({ transaction }) => [transaction.id, transaction.updatedAt]),
        ),
      };

      // Um lote só: reajuste e ocorrências entram juntos ou nada entra. Em duas
      // gravações, uma falha no meio deixaria o extrato com o valor novo e a
      // série com o velho, sem nada na tela que contasse a diferença.
      await session.putRowsIfCurrent(
        { recurrenceAdjustments: [adjustment], transactions },
        expected,
      );
    } catch (cause) {
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  return {
    async createSeries(draft, rule, today) {
      const series: RecurrenceDraft = {
        kind: draft.kind,
        description: draft.description,
        amountMinor: draft.amountMinor,
        currency: "BRL",
        categoryId: draft.categoryId,
        paymentMethodId: draft.paymentMethodId,
        cashbackMinor: draft.cashbackMinor,
        frequency: rule.frequency,
        scheduleType: rule.scheduleType,
        scheduleN: rule.scheduleN,
        startOn: draft.occurredOn,
        endOn: rule.endOn,
        active: true,
      };
      // Se a série não gravar, `mutate` rejeita e a materialização nem começa.
      await session.mutate("recurrences", (repo) => repo.create(series));
      await materializeDue(today);
    },

    materializeDue,

    editSeries: (id, draft) => session.mutate("recurrences", (repo) => repo.update(id, draft)),
    removeSeries: (id) => session.mutate("recurrences", (repo) => repo.remove(id)),
    adjustSeries,
    removeAdjustment: (id) => session.mutate("recurrenceAdjustments", (repo) => repo.remove(id)),
  };
}
