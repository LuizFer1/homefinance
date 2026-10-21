import type { Ulid } from "../ids/ulid";
import type { BaseRow, Draft } from "./base";

/**
 * Meta mensal de gasto de uma categoria: vale todo mês, até ser editada ou apagada.
 *
 * É outra coisa que a meta de uma reserva (`Reserve.targetMinor`): aquela é valor a
 * acumular, esta é um teto de gasto. Uma meta por categoria, e o id é derivado da
 * categoria (`budgetIdFor`): dois aparelhos que definem a meta da mesma categoria
 * escrevem a **mesma** linha, e o LWW por linha as converge, em vez de o sync trazer
 * duas metas.
 */
export interface Budget extends BaseRow {
  categoryId: Ulid;
  /** Teto mensal em centavos, inteiro e positivo. */
  limitMinor: number;
}

export type BudgetDraft = Draft<Budget>;
