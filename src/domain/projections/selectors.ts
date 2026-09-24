import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { type BaseRow, isAlive } from "../model/base";
import type { Category } from "../model/category";
import type { PaymentMethod } from "../model/payment-method";
import { NEUTRAL_TOKEN } from "../model/tokens";
import type { Transaction, TransactionKind } from "../model/transaction";
import type { User } from "../model/user";

export interface Totals {
  incomeMinor: number;
  expenseMinor: number;
  balanceMinor: number;
}

/** Visíveis: não apagados, mais recentes primeiro. */
export function listTransactions(state: AppState): Transaction[] {
  return Object.values(state.transactions)
    .filter((record) => isAlive(record))
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
 * Não filtra linha apagada: chamar isto com
 * `Object.values(state.transactions)` cru soma lançamentos apagados em silêncio.
 * `balanceMinor` negativo é normal — significa mais despesa que receita.
 */
export function totals(records: Transaction[]): Totals {
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
  items: Transaction[];
  totals: Totals;
}

/**
 * Agrupa os registros **já ordenados** por `listTransactions` em dias.
 *
 * Depende da ordenação de entrada de propósito: agrupar consecutivos preserva a
 * ordem que a lista já decidiu, enquanto reagrupar por chave num objeto perderia
 * o desempate por `id` e faria os dias pularem de posição conforme a ordem de
 * inserção.
 *
 * O subtotal é o **saldo** do dia, não a soma bruta: num dia com salário e
 * mercado, o que o usuário quer saber é o que sobrou.
 */
export function groupByDay(items: Transaction[]): DayGroup[] {
  const groups: { date: string; items: Transaction[] }[] = [];

  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.date === item.occurredOn) last.items.push(item);
    else groups.push({ date: item.occurredOn, items: [item] });
  }

  return groups.map((group) => ({ ...group, totals: totals(group.items) }));
}

/** Não apagados. Mesma regra de visibilidade de `listTransactions`. */
function visible<T extends BaseRow>(bucket: Record<Ulid, T>): T[] {
  return Object.values(bucket).filter((row) => isAlive(row));
}

/**
 * Ordem alfabética com desempate por `id`. Sem o desempate a ordem depende da
 * inserção no objeto, e a lista pula de posição conforme a ordem de inserção.
 */
function byNameThenId<T extends BaseRow & { name: string }>(a: T, b: T): number {
  const byName = a.name.localeCompare(b.name, "pt-BR");
  if (byName !== 0) return byName;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function listCategories(state: AppState): Category[] {
  return visible(state.categories).sort(byNameThenId);
}

/**
 * As categorias que servem a um lado do lançamento, mais as que servem aos dois.
 *
 * `both` entra em ambas as listas de propósito: investimentos e transferências
 * são legitimamente despesa e receita, e forçar o usuário a criar duas
 * categorias homônimas quebraria os relatórios que agregam por categoria.
 */
export function listCategoriesFor(state: AppState, kind: TransactionKind): Category[] {
  return listCategories(state).filter(
    (category) => category.kind === kind || category.kind === "both",
  );
}

export function listPaymentMethods(state: AppState): PaymentMethod[] {
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
  bucket: Record<Ulid, BaseRow & { name: string }>,
  id: Ulid | null,
  ausente: string,
  morto: string,
): string {
  if (id === null) return ausente;
  const record = bucket[id];
  if (!isAlive(record)) return morto;
  return record.name;
}

export function resolveCategoryName(state: AppState, id: Ulid | null): string {
  return resolveName(state.categories, id, "Sem categoria", "Categoria removida");
}

export function resolvePaymentMethodName(state: AppState, id: Ulid | null): string {
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
export function findCategory(state: AppState, id: Ulid | null): Category | null {
  if (id === null) return null;
  const record = state.categories[id];
  if (!isAlive(record)) return null;
  return record;
}

/**
 * Perfil visível, ou nulo.
 *
 * Autor ausente e autor apagado colapsam no mesmo resultado de propósito: quem
 * chama não faz nada de diferente com os dois, e distinguir vazaria "esse perfil
 * existiu" na tela sem nenhum ganho.
 */
export function findUser(state: AppState, id: Ulid | null): User | null {
  if (id === null) return null;
  const record = state.users[id];
  if (!isAlive(record)) return null;
  return record;
}

/**
 * Cor da marca de autoria. Neutro para lançamento sem autor (`userId` nulo) ou
 * cujo perfil não está visível.
 */
export function resolveAuthorColor(state: AppState, id: Ulid | null): string {
  return findUser(state, id)?.color ?? NEUTRAL_TOKEN;
}
