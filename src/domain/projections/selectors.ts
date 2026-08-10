import type { Ulid } from "../ids/ulid";
import type {
  CategoryRecord,
  PaymentMethodRecord,
  ProjectionState,
  TransactionRecord,
  UserRecord,
} from "./apply";
import { type EntityRecordBase, NEUTRAL_TOKEN } from "./entities";

export interface Totals {
  incomeMinor: number;
  expenseMinor: number;
  balanceMinor: number;
}

/** Visíveis: materializados e não apagados, mais recentes primeiro. */
export function listTransactions(state: ProjectionState): TransactionRecord[] {
  return Object.values(state.transactions)
    .filter((record) => record.materialized && !record.deleted)
    .sort((a, b) => {
      if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
      // Desempate por id, para a ordem não depender da inserção no objeto.
      if (a.id === b.id) return 0;
      return a.id < b.id ? 1 : -1;
    });
}

/**
 * Soma os registros **já filtrados** por `listTransactions`.
 *
 * Não filtra tombstone nem registro-casca: chamar isto com
 * `Object.values(state.transactions)` cru soma lançamentos apagados em silêncio.
 * `balanceMinor` negativo é normal — significa mais despesa que receita.
 */
export function totals(records: TransactionRecord[]): Totals {
  let incomeMinor = 0;
  let expenseMinor = 0;

  for (const record of records) {
    if (record.kind === "income") incomeMinor += record.amountMinor;
    else expenseMinor += record.amountMinor;
  }

  return { incomeMinor, expenseMinor, balanceMinor: incomeMinor - expenseMinor };
}

/** Materializados e não apagados. Mesma regra de visibilidade de `listTransactions`. */
function visible<T extends EntityRecordBase>(bucket: Record<Ulid, T>): T[] {
  return Object.values(bucket).filter((record) => record.materialized && !record.deleted);
}

/**
 * Ordem alfabética com desempate por `id`. Sem o desempate a ordem depende da
 * inserção no objeto, e a lista pula de posição a cada refold do log.
 */
function byNameThenId<T extends EntityRecordBase & { name: string }>(a: T, b: T): number {
  const byName = a.name.localeCompare(b.name, "pt-BR");
  if (byName !== 0) return byName;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function listCategories(state: ProjectionState): CategoryRecord[] {
  return visible(state.categories).sort(byNameThenId);
}

export function listPaymentMethods(state: ProjectionState): PaymentMethodRecord[] {
  return visible(state.paymentMethods).sort(byNameThenId);
}

/**
 * Rótulo para referência morta.
 *
 * Apagar categoria **não** cascateia, então lançamento apontando para registro
 * deletado é estado normal e permanente — não erro. Devolver o id cru vazaria
 * ULID na tela e no CSV de exportação; devolver vazio faria o lançamento parecer
 * sem categoria, que é outra coisa.
 */
function resolveName(
  bucket: Record<Ulid, EntityRecordBase & { name: string }>,
  id: Ulid | null,
  ausente: string,
  morto: string,
): string {
  if (id === null) return ausente;
  const record = bucket[id];
  if (record === undefined || record.deleted || !record.materialized) return morto;
  return record.name;
}

export function resolveCategoryName(state: ProjectionState, id: Ulid | null): string {
  return resolveName(state.categories, id, "Sem categoria", "Categoria removida");
}

export function resolvePaymentMethodName(state: ProjectionState, id: Ulid | null): string {
  return resolveName(state.paymentMethods, id, "Sem forma de pagamento", "Forma removida");
}

/**
 * Perfil visível, ou nulo.
 *
 * Autor ausente e autor apagado colapsam no mesmo resultado de propósito: quem
 * chama não faz nada de diferente com os dois, e distinguir vazaria "esse perfil
 * existiu" na tela sem nenhum ganho.
 */
export function findUser(state: ProjectionState, id: Ulid | null): UserRecord | null {
  if (id === null) return null;
  const record = state.users[id];
  if (record === undefined || record.deleted || !record.materialized) return null;
  return record;
}

/**
 * Cor da marca de autoria. Neutro para lançamento sem autor — o histórico
 * gravado antes desta fatia, que nunca deixa de existir num log eterno.
 */
export function resolveAuthorColor(state: ProjectionState, id: Ulid | null): string {
  return findUser(state, id)?.color ?? NEUTRAL_TOKEN;
}
