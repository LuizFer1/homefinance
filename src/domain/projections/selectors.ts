import type { TransactionKind } from "../events/transaction";
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

export interface DayGroup {
  /** 'YYYY-MM-DD'. */
  date: string;
  items: TransactionRecord[];
  totals: Totals;
}

/**
 * Agrupa os registros **já ordenados** por `listTransactions` em dias.
 *
 * Depende da ordenação de entrada de propósito: agrupar consecutivos preserva a
 * ordem que a lista já decidiu, enquanto reagrupar por chave num objeto perderia
 * o desempate por `id` e faria os dias pularem de posição a cada refold.
 *
 * O subtotal é o **saldo** do dia, não a soma bruta: num dia com salário e
 * mercado, o que o usuário quer saber é o que sobrou.
 */
export function groupByDay(items: TransactionRecord[]): DayGroup[] {
  const groups: { date: string; items: TransactionRecord[] }[] = [];

  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.date === item.occurredOn) last.items.push(item);
    else groups.push({ date: item.occurredOn, items: [item] });
  }

  return groups.map((group) => ({ ...group, totals: totals(group.items) }));
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

/**
 * As categorias que servem a um lado do lançamento, mais as que servem aos dois.
 *
 * `both` entra em ambas as listas de propósito: investimentos e transferências
 * são legitimamente despesa e receita, e forçar o usuário a criar duas
 * categorias homônimas quebraria os relatórios que agregam por categoria.
 *
 * `kind` desconhecido — de uma versão mais nova via sync — não chega aqui: o
 * fold já o rejeita e a casca mantém `both`, então a categoria aparece nas duas
 * listas em vez de sumir das duas.
 */
export function listCategoriesFor(state: ProjectionState, kind: TransactionKind): CategoryRecord[] {
  return listCategories(state).filter(
    (category) => category.kind === kind || category.kind === "both",
  );
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
 * Categoria visível, ou nulo — para a tela pegar ícone e cor.
 *
 * Separado de `resolveCategoryName` porque responde outra pergunta: o nome tem
 * rótulo neutro para referência morta ("Categoria removida"), enquanto ícone e
 * cor de um registro apagado não devem aparecer. Apagar categoria não cascateia,
 * então lançamento apontando para registro deletado é estado permanente.
 */
export function findCategory(state: ProjectionState, id: Ulid | null): CategoryRecord | null {
  if (id === null) return null;
  const record = state.categories[id];
  if (record === undefined || record.deleted || !record.materialized) return null;
  return record;
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
