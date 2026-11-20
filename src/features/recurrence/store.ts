import { buildRow } from "../../data/repository";
import { floorHlc } from "../../domain/clock/hlc";
import { planDuplicateRepair } from "../../domain/ids/duplicate-repair";
import type { Ulid } from "../../domain/ids/ulid";
import type { Draft } from "../../domain/model/base";
import { BOOKS, bookOf } from "../../domain/model/book";
import { stateForBook } from "../../domain/model/book-view";
import type { Recurrence, RecurrenceDraft, RecurrenceRule } from "../../domain/model/recurrence";
import type { RecurrenceAdjustment } from "../../domain/model/recurrence-adjustment";
import type { Transaction, TransactionDraft } from "../../domain/model/transaction";
import { MAX_MINOR } from "../../domain/money/mask";
import { type AdjustmentInput, planAdjustment } from "../../domain/recurrence/adjust-plan";
import { adjustmentForKey, adjustmentTargetId } from "../../domain/recurrence/adjustments";
import { planAuthorRepair } from "../../domain/recurrence/author";
import { planSeriesEdit } from "../../domain/recurrence/edit-plan";
import {
  installmentDescription,
  installmentRule,
  splitInstallments,
} from "../../domain/recurrence/installments";
import { planOccurrences } from "../../domain/recurrence/plan";
import {
  describeError,
  type ExpectedVersions,
  type Session,
  StaleRowsError,
} from "../session/session";

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
   * Série fixa passa a ter valor variável. Nada já lançado é reescrito: as
   * ocorrências existentes não têm `estimated` e por isso contam como
   * confirmadas na média da próxima.
   */
  makeVariable: (id: Ulid) => Promise<Recurrence>;
  /**
   * Reajusta a série a partir de uma competência e atualiza as ocorrências já
   * lançadas que ainda seguem a série (ver `planAdjustment`).
   */
  adjustSeries: (input: AdjustmentInput) => Promise<void>;
  /**
   * "Este e os próximos": grava a ocorrência editada e leva à série, num lote só,
   * o que mudou nela (valor por reajuste a partir da competência). As próximas já
   * lançadas seguem onde ainda têm o valor da série (ver `planSeriesEdit`).
   */
  editFollowing: (transactionId: Ulid, draft: TransactionDraft) => Promise<void>;
  /** Desfaz um reajuste (exclusão lógica). Ocorrências já lançadas ficam como estão. */
  removeAdjustment: (id: Ulid) => Promise<RecurrenceAdjustment>;
  /**
   * Põe em toda ocorrência o autor da sua série (ver `planAuthorRepair`).
   * Idempotente: com tudo certo não grava nada. Roda no boot e depois do sync.
   */
  repairAuthors: () => Promise<void>;
  /**
   * Apaga a cópia v2 das ocorrências e depósitos mensais que ficaram duas vezes
   * (`planDuplicateRepair`). Idempotente: sem duplicata não grava nada. Roda no
   * boot, depois da materialização, e depois de cada pull.
   */
  repairDuplicates: () => Promise<void>;
}

/**
 * Guarda para qualquer chamador, não só o sheet: centavo fracionário ou valor
 * acima do que o campo de dinheiro aceita entraria num reajuste, que é eterno. O
 * teto é o mesmo `MAX_MINOR` do sheet, para os dois não discordarem.
 */
function assertAdjustmentAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_MINOR) {
    throw new Error("Valor de reajuste inválido");
  }
}

export function createRecurrenceStore(session: Session): RecurrenceStore {
  /**
   * Linha do reajuste pronta para o lote. Mesma competência é a mesma linha,
   * achada pela chave `(série, competência)` e não pelo id (spec do id estável,
   * §4.3): inclusive uma apagada — refazer o reajuste de janeiro é o mesmo fato —
   * e, com duas vivas, a da regra R, a que a tela mostra. Sem linha da chave, o id
   * é v1 se o lugar está livre e v2 se é de outro reajuste: o v1 sozinho, com a
   * colisão, achava o reajuste de outra série e trocava o valor dela.
   *
   * Lê a tabela inteira (`fullState`): o lugar v1 pode ser de um reajuste da
   * outra conta, que a visão da conta ativa esconde.
   */
  function adjustmentRow(input: AdjustmentInput): {
    adjustment: RecurrenceAdjustment;
    existing: RecurrenceAdjustment | null;
  } {
    const clock = session.clock();
    const full = session.fullState.value;
    const existing = adjustmentForKey(full, input.recurrenceId, input.fromPeriod);
    const adjustment: RecurrenceAdjustment =
      existing === null
        ? buildRow<RecurrenceAdjustment>(
            clock,
            {
              recurrenceId: input.recurrenceId,
              fromPeriod: input.fromPeriod,
              amountMinor: input.amountMinor,
            },
            adjustmentTargetId(full, input.recurrenceId, input.fromPeriod),
            // O reajuste é filho da série: herda a conta dela.
            bookOf(full.recurrences[input.recurrenceId]),
          )
        : {
            ...existing,
            amountMinor: input.amountMinor,
            deletedAt: null,
            updatedAt: clock.stamp().hlc,
            dirty: 1,
          };
    return { adjustment, existing };
  }

  async function editFollowing(transactionId: Ulid, draft: TransactionDraft): Promise<void> {
    // Mesma proteção de `transactions/store.ts`: autoria não muda numa edição,
    // nem com `userId` contrabandeado no draft por um cast.
    const { userId: _userId, ...semAutor } = draft as TransactionDraft & { userId?: unknown };
    try {
      const state = session.state.value;
      const plan = planSeriesEdit(state, transactionId, semAutor);
      // O estado pode ter mudado entre a pergunta e o toque (o sync pausou a
      // série, por exemplo): sem o que levar à série, é a edição comum.
      if (plan === null) {
        await session.mutate("transactions", (repo) => repo.update(transactionId, semAutor));
        return;
      }
      if (plan.adjustment !== null) {
        // A mesma guarda de `adjustSeries`: o reajuste é eterno na tabela.
        assertAdjustmentAmount(plan.adjustment.amountMinor);
        if (plan.adjustmentPlan === null) throw new Error("Série não existe");
      }

      const clock = session.clock();
      const touched = [plan.transaction, ...plan.following];
      const transactions: Transaction[] = touched.map((row) => ({
        ...row,
        updatedAt: clock.stamp().hlc,
        dirty: 1,
      }));
      const hasPatch = Object.keys(plan.seriesPatch).length > 0;
      const recurrences: Recurrence[] = hasPatch
        ? [{ ...plan.series, ...plan.seriesPatch, updatedAt: clock.stamp().hlc, dirty: 1 }]
        : [];
      const adjusted =
        plan.adjustment !== null && plan.adjustmentPlan !== null
          ? adjustmentRow(plan.adjustment)
          : null;

      // Toda linha regravada entra com a versão lida, a série inclusive: se
      // outra aba ou o sync mudou qualquer uma, nada é gravado (`StaleRowsError`)
      // em vez de desfazer a mudança de lá ou ressuscitar uma linha apagada. A
      // série entra como esperada mesmo sem patch: o plano dependeu dela.
      const expected: ExpectedVersions = {
        recurrences: { [plan.series.id]: plan.series.updatedAt },
        transactions: Object.fromEntries(touched.map((row) => [row.id, row.updatedAt])),
        ...(adjusted === null
          ? {}
          : {
              recurrenceAdjustments: {
                [adjusted.adjustment.id]: adjusted.existing?.updatedAt ?? null,
              },
            }),
      };

      // Um lote só: a ocorrência, a série, o reajuste e as próximas entram juntos
      // ou nada entra. Em gravações separadas, uma falha no meio deixaria o mês
      // editado com a categoria nova e a série gerando a velha.
      await session.putRowsIfCurrent(
        {
          transactions,
          recurrences,
          ...(adjusted === null ? {} : { recurrenceAdjustments: [adjusted.adjustment] }),
        },
        expected,
      );
    } catch (cause) {
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  async function materializeDue(today: string): Promise<void> {
    // Todo o corpo entra no try: `clock()` chamado antes do `init` concluir é
    // um erro de uso, mas ainda tem que preencher `error` como qualquer outra
    // falha — quem só observa o signal não pode perder o motivo.
    try {
      // Uma conta por vez, incluindo a inativa: o aluguel do comércio vence
      // mesmo com a pessoa na conta pessoal. Cada ocorrência herda a conta da
      // série (`plan.book`), nunca a ativa.
      const plans = BOOKS.flatMap((book) =>
        planOccurrences(stateForBook(session.fullState.value, book), today),
      );
      if (plans.length === 0) return;

      const clock = session.clock();
      const localUserId = session.localUserId.value;
      // Monta as linhas fora da transação (`buildRow` não grava). O plano
      // veio do `state` em memória, que pode estar desatualizado (outra aba
      // ainda não recarregou); `insertMissing` — e não `putRows`/`bulkPut` —
      // é quem grava, porque ele nunca sobrescreve uma linha que já existe no
      // banco. Sem isso, a ocorrência que o usuário apagou nesta ou noutra
      // aba voltaria viva no próximo boot.
      const rows = plans.map((plan) => {
        // O autor é o da série, não o deste aparelho: o mês que nasce no telefone
        // de outra pessoa continua sendo lançamento de quem criou a série.
        const userId = plan.userId ?? localUserId;
        const row = buildRow<Transaction>(
          clock,
          { ...plan.draft, userId },
          plan.entityId,
          plan.book,
        );
        // Estimativa nasce "velha" (ver `floorHlc`): se outro aparelho já
        // confirmou esta competência e o sync ainda não trouxe, a confirmação
        // tem que vencer esta linha no LWW, e não o contrário.
        return plan.anchored
          ? { ...row, updatedAt: floorHlc(plan.draft.occurredOn, clock.deviceId) }
          : row;
      });
      await session.insertMissing("transactions", rows);
    } catch (cause) {
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  async function adjustSeries(input: AdjustmentInput): Promise<void> {
    try {
      assertAdjustmentAmount(input.amountMinor);
      const state = session.state.value;
      // A estimativa da variável é a média das confirmadas: um reajuste seria
      // ignorado por ela e ficaria na tabela como um fato que não vale.
      if (state.recurrences[input.recurrenceId]?.variable === true) {
        throw new Error("Série de valor variável não tem reajuste");
      }
      const plan = planAdjustment(state, input);
      if (plan === null) throw new Error("Série não existe");

      const clock = session.clock();
      const { adjustment, existing } = adjustmentRow(input);
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
        recurrenceAdjustments: { [adjustment.id]: existing?.updatedAt ?? null },
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

  async function removeAdjustment(id: Ulid): Promise<RecurrenceAdjustment> {
    const target = session.fullState.value.recurrenceAdjustments[id];
    // Linha que a memória não conhece (o repositório rejeita) ou já apagada (não
    // regrava): o caminho de sempre.
    if (target === undefined || target.deletedAt !== null) {
      return session.mutate("recurrenceAdjustments", (repo) => repo.remove(id));
    }
    try {
      // Todas as vivas da competência, não só a escolhida: com duas (aparelho velho
      // e novo), a tela mostra uma só, e apagar só ela faria a outra reaparecer
      // valendo. O reajuste de outra série que só divide o lugar v1 não é da chave.
      const rows = Object.values(session.fullState.value.recurrenceAdjustments).filter(
        (row) =>
          row.deletedAt === null &&
          row.recurrenceId === target.recurrenceId &&
          row.fromPeriod === target.fromPeriod,
      );
      const clock = session.clock();
      const removed = rows.map((row) => {
        const { hlc } = clock.stamp();
        return { ...row, deletedAt: hlc, updatedAt: hlc, dirty: 1 as const };
      });
      // Se o sync ou outra aba mexeu numa delas, nada é apagado (`StaleRowsError`).
      await session.putRowsIfCurrent(
        { recurrenceAdjustments: removed },
        {
          recurrenceAdjustments: Object.fromEntries(rows.map((row) => [row.id, row.updatedAt])),
        },
      );
      const chosen = removed.find((row) => row.id === id);
      if (chosen === undefined) throw new Error("Reajuste não existe");
      return chosen;
    } catch (cause) {
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  async function repairAuthors(): Promise<void> {
    try {
      // As duas contas, cada uma na sua visão: a autoria da série e a das
      // ocorrências moram na mesma conta, e o reparo preserva `book` (spread).
      const plan = BOOKS.map((book) =>
        planAuthorRepair(stateForBook(session.fullState.value, book)),
      ).reduce((all, one) => ({
        recurrences: [...all.recurrences, ...one.recurrences],
        transactions: [...all.transactions, ...one.transactions],
      }));
      if (plan.recurrences.length === 0 && plan.transactions.length === 0) return;

      const clock = session.clock();
      const recurrences: Recurrence[] = plan.recurrences.map(({ row, userId }) => ({
        ...row,
        userId,
        updatedAt: clock.stamp().hlc,
        dirty: 1,
      }));
      const transactions: Transaction[] = plan.transactions.map(({ row, userId }) => ({
        ...row,
        userId,
        updatedAt: clock.stamp().hlc,
        dirty: 1,
      }));
      // Só regrava a linha que ainda está na versão lida: se o sync ou outra aba
      // a mudou desde o boot, a correção espera o próximo gatilho em vez de
      // desfazer aquela mudança (ou ressuscitar uma linha apagada).
      const expected: ExpectedVersions = {
        recurrences: Object.fromEntries(plan.recurrences.map(({ row }) => [row.id, row.updatedAt])),
        transactions: Object.fromEntries(
          plan.transactions.map(({ row }) => [row.id, row.updatedAt]),
        ),
      };
      await session.putRowsIfCurrent({ recurrences, transactions }, expected);
    } catch (cause) {
      // Linha velha não é falha a mostrar: a correção é refeita no próximo boot
      // ou sync, com o estado já relido.
      if (cause instanceof StaleRowsError) return;
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  async function repairDuplicates(): Promise<void> {
    // Trabalho de fundo: um `StaleRowsError` aqui não é falha da pessoa, e o aviso
    // que a sessão põe nele não pode tomar o lugar de um erro que já estava lá.
    const before = session.error.value;
    try {
      // A tabela inteira: o par é decidido só pelos ids, e as duas cópias moram
      // na conta da série (o tombstone preserva `book` pelo spread).
      const plan = planDuplicateRepair(session.fullState.value);
      if (plan.transactions.length === 0 && plan.reserveMovements.length === 0) return;

      const clock = session.clock();
      const tombstone = <T extends { deletedAt: string | null; updatedAt: string }>(row: T): T => {
        const { hlc } = clock.stamp();
        return { ...row, deletedAt: hlc, updatedAt: hlc, dirty: 1 };
      };
      const transactions: Transaction[] = plan.transactions.flatMap(({ loser, survivor }) => [
        tombstone(loser),
        ...(survivor === null
          ? []
          : [{ ...survivor, updatedAt: clock.stamp().hlc, dirty: 1 as const }]),
      ]);
      const reserveMovements = plan.reserveMovements.map(({ loser }) => tombstone(loser));
      // As duas linhas de cada par entram com a versão lida, a v1 inclusive mesmo
      // sem ser regravada: se o sync ou outra aba a apagou, apagar a v2 deixaria o
      // fato sem nenhuma linha viva. Divergiu: espera o próximo boot ou pull.
      const expected: ExpectedVersions = {
        transactions: Object.fromEntries(
          plan.transactions.flatMap(({ loser, keeper }) => [
            [loser.id, loser.updatedAt],
            [keeper.id, keeper.updatedAt],
          ]),
        ),
        reserveMovements: Object.fromEntries(
          plan.reserveMovements.flatMap(({ loser, keeper }) => [
            [loser.id, loser.updatedAt],
            [keeper.id, keeper.updatedAt],
          ]),
        ),
      };
      await session.putRowsIfCurrent({ transactions, reserveMovements }, expected);
    } catch (cause) {
      if (cause instanceof StaleRowsError) {
        session.error.value = before;
        return;
      }
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  return {
    async createSeries(draft, input, today) {
      // Parcelado, a regra sai do número de vezes e da data da compra, e não do
      // que o formulário montou: frequência, dia e data final são consequência
      // do parcelamento, e uma regra divergente geraria parcelas a mais.
      const rule: RecurrenceRule =
        input.installments === undefined
          ? input
          : {
              ...installmentRule(draft.occurredOn, input.installments),
              installments: input.installments,
            };
      // Parcelado: o valor digitado é o total, e a série grava a parcela. A sobra
      // de centavos vai para a 1ª, guardada na série para que qualquer aparelho
      // gere a mesma 1ª parcela.
      const split =
        rule.installments === undefined
          ? null
          : splitInstallments(draft.amountMinor, rule.installments);
      const series: Draft<Recurrence> = {
        kind: draft.kind,
        description:
          rule.installments === undefined
            ? draft.description
            : installmentDescription(draft.description, rule.installments),
        amountMinor: split?.amountMinor ?? draft.amountMinor,
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
        // Só na variável: série fixa continua sem a coluna, como antes dela.
        ...(rule.variable ? { variable: true } : {}),
        ...(split !== null && split.firstAmountMinor !== split.amountMinor
          ? { firstAmountMinor: split.firstAmountMinor }
          : {}),
        // Autoria vem da sessão, só no create; as ocorrências herdam daqui.
        userId: session.localUserId.value,
      };
      // Se a série não gravar, `mutate` rejeita e a materialização nem começa.
      await session.mutate("recurrences", (repo) => repo.create(series));
      await materializeDue(today);
    },

    materializeDue,

    // Mesma proteção de `transactions/store.ts`: o tipo já barra `userId` no
    // draft, mas quem chama em runtime não é obrigado a respeitar o tipo.
    editSeries: (id, draft) => {
      const { userId: _userId, ...semAutor } = draft as RecurrenceDraft & { userId?: unknown };
      return session.mutate("recurrences", (repo) => repo.update(id, semAutor));
    },
    removeSeries: (id) => session.mutate("recurrences", (repo) => repo.remove(id)),
    makeVariable: (id) =>
      session.mutate("recurrences", (repo) => repo.update(id, { variable: true })),
    adjustSeries,
    editFollowing,
    removeAdjustment,
    repairAuthors,
    repairDuplicates,
  };
}
