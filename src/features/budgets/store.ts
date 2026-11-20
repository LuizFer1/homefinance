import { buildRow } from "../../data/repository";
import { budgetForCategory, budgetTargetId } from "../../domain/budgets/budget-id";
import type { Ulid } from "../../domain/ids/ulid";
import { isAlive } from "../../domain/model/base";
import { bookOf } from "../../domain/model/book";
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
        const category = findCategory(state, categoryId);
        if (category === null) throw new Error("Categoria não existe");

        // Mesma categoria é a mesma linha, achada pelo `categoryId` e não pelo id
        // (spec do id estável, §4.3): inclusive uma apagada — refazer a meta é o
        // mesmo fato — e, com duas vivas, a da regra R, a que a tela mostra. Sem
        // linha da categoria, v1 se o lugar está livre e v2 se é de outra meta: o
        // v1 sozinho, com a colisão, tomava a meta de outra categoria.
        //
        // A tabela inteira (`fullState`), não a visão: o lugar v1 pode ser de uma
        // meta da outra conta, e a visão ainda zera `categoryId` que aponta para a
        // outra conta — espalhar uma linha dela gravaria isso no disco.
        const full = session.fullState.value;
        const existing = budgetForCategory(full, categoryId);
        const clock = session.clock();
        const row: Budget =
          existing === null
            ? // A meta é filha da categoria: herda a conta dela.
              buildRow<Budget>(
                clock,
                { categoryId, limitMinor },
                budgetTargetId(full, categoryId),
                bookOf(category),
              )
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
          { budgets: { [row.id]: existing?.updatedAt ?? null } },
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
