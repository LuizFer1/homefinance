import { buildRow } from "../../data/repository";
import { budgetIdFor } from "../../domain/budgets/budget-id";
import type { Ulid } from "../../domain/ids/ulid";
import { isAlive } from "../../domain/model/base";
import type { Budget } from "../../domain/model/budget";
import { MAX_MINOR } from "../../domain/money/mask";
import { findCategory } from "../../domain/projections/selectors";
import { describeError, type ExpectedVersions, type Session } from "../session/session";

/** Metas mensais por categoria. */
export interface BudgetsStore {
  /** Cria ou edita a meta da categoria (uma por categoria). */
  set: (categoryId: Ulid, limitMinor: number) => Promise<void>;
  /** Apaga a meta da categoria; sem meta, não faz nada. */
  remove: (categoryId: Ulid) => Promise<void>;
}

export function createBudgetsStore(session: Session): BudgetsStore {
  async function guarded(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (cause) {
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  return {
    set: (categoryId, limitMinor) =>
      guarded(async () => {
        // Guarda para qualquer chamador, não só o formulário: centavo fracionário
        // ou valor acima do campo de dinheiro entraria num log que é eterno.
        if (!Number.isSafeInteger(limitMinor) || limitMinor <= 0 || limitMinor > MAX_MINOR) {
          throw new Error("Valor da meta inválido");
        }
        const state = session.state.value;
        if (findCategory(state, categoryId) === null) throw new Error("Categoria não existe");

        const id = budgetIdFor(categoryId);
        const existing = state.budgets[id];
        const clock = session.clock();
        // Mesma categoria é a mesma linha (id determinístico), inclusive uma apagada:
        // refazer a meta é o mesmo fato, e criar outra linha com o mesmo id
        // derrubaria o lote.
        const row: Budget =
          existing === undefined
            ? buildRow<Budget>(clock, { categoryId, limitMinor }, id)
            : {
                ...existing,
                categoryId,
                limitMinor,
                deletedAt: null,
                updatedAt: clock.stamp().hlc,
                dirty: 1,
              };
        await session.putRowsIfCurrent(
          { budgets: [row] },
          { budgets: { [id]: existing?.updatedAt ?? null } },
        );
      }),

    remove: (categoryId) =>
      guarded(async () => {
        const state = session.state.value;
        // Todas as linhas da categoria, não só a de id derivado: uma fusão de
        // padrões pode ter deixado a meta da cópia apontando para ela.
        const rows = Object.values(state.budgets).filter(
          (budget) => isAlive(budget) && budget.categoryId === categoryId,
        );
        if (rows.length === 0) return;

        const clock = session.clock();
        const removed = rows.map((row) => {
          const { hlc } = clock.stamp();
          return { ...row, deletedAt: hlc, updatedAt: hlc, dirty: 1 as const };
        });
        const expected: ExpectedVersions = {
          budgets: Object.fromEntries(rows.map((row) => [row.id, row.updatedAt])),
        };
        await session.putRowsIfCurrent({ budgets: removed }, expected);
      }),
  };
}
