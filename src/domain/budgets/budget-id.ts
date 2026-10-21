import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";

/**
 * Id da meta de uma categoria: o mesmo em qualquer aparelho. A semente leva um
 * prefixo para o id nunca colidir com o de outra tabela derivada da mesma categoria.
 */
export function budgetIdFor(categoryId: Ulid): Ulid {
  return stableEntityId(`budget:${categoryId}`);
}
