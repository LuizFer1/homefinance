import { stableEntityIdV1 } from "../ids/stable-id";
import { pickStableId, rowForKey } from "../ids/stable-slot";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { Budget } from "../model/budget";

/**
 * Semente do id da meta. Leva um prefixo para o id nunca colidir com o de outra
 * tabela derivada da mesma categoria.
 */
export function budgetSeed(categoryId: Ulid): string {
  return `budget:${categoryId}`;
}

/**
 * O lugar v1 da meta de uma categoria: o mesmo em qualquer aparelho.
 *
 * É o lugar, não a identidade: a v1 colide (spec do id estável, §1) e a linha do
 * lugar pode ser a meta de outra categoria. Quem procura a meta usa
 * `budgetForCategory`; quem grava, `budgetTargetId`.
 */
export function budgetIdFor(categoryId: Ulid): Ulid {
  return stableEntityIdV1(budgetSeed(categoryId));
}

/**
 * A linha da meta da categoria, procurada pelo `categoryId` — viva ou apagada,
 * em qualquer id (ver `rowForKey`). Pelo id derivado acharia, depois de uma
 * colisão, a meta de outra categoria, e o escritor a tomaria para esta.
 */
export function budgetForCategory(state: AppState, categoryId: Ulid): Budget | null {
  return rowForKey(Object.values(state.budgets).filter((row) => row.categoryId === categoryId));
}

/**
 * Id onde gravar a meta: o da linha que a categoria já tem, ou, sem nenhuma, v1
 * se o lugar está livre e v2 se é de outra meta (`pickStableId`).
 *
 * Quem grava passa a tabela inteira (`fullState`): o lugar v1 pode ser de uma
 * meta da outra conta, que a visão da conta ativa esconde.
 */
export function budgetTargetId(state: AppState, categoryId: Ulid): Ulid {
  return (
    budgetForCategory(state, categoryId)?.id ?? pickStableId(state.budgets, budgetSeed(categoryId))
  );
}
