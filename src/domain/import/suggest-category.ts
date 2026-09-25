import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { TransactionKind } from "../model/transaction";

/**
 * Descrição reduzida ao que identifica o estabelecimento: maiúsculas, sem
 * acento, sem pontuação. Com `keepDigits` falso some também o número — "UBER
 * TRIP 1234" e "UBER TRIP 5678" são o mesmo lugar para efeito de categoria.
 */
export function normalizeDescription(description: string, keepDigits = true): string {
  const letters = description
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(keepDigits ? /[^A-Z0-9]+/g : /[^A-Z]+/g, " ");
  return letters.replace(/\s+/g, " ").trim();
}

export interface CategoryIndex {
  full: Map<string, Ulid>;
  first: Map<string, Ulid>;
}

/** Primeira palavra só vale como pista a partir de 3 letras: "DE", "PG" casariam com tudo. */
const MIN_FIRST_WORD = 3;

/**
 * Índice descrição → categoria a partir do que o usuário já lançou. Montado uma
 * vez por revisão, não por linha: a busca de cada linha vira um `Map.get`.
 *
 * Lançamentos mais recentes vencem: se o usuário reclassificou "IFOOD", a
 * escolha nova é a que ele quer ver sugerida.
 */
export function buildCategoryIndex(state: AppState): CategoryIndex {
  const index: CategoryIndex = { full: new Map(), first: new Map() };
  const rows = Object.values(state.transactions)
    .filter((row) => isAlive(row) && row.categoryId !== null)
    .sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0));

  for (const row of rows) {
    const categoryId = row.categoryId;
    // Categoria apagada não é sugestão: o usuário a tirou de circulação.
    if (categoryId === null || !isAlive(state.categories[categoryId])) continue;
    const key = normalizeDescription(row.description, false);
    if (key === "") continue;
    index.full.set(`${row.kind}:${key}`, categoryId);
    const first = key.split(" ")[0] ?? "";
    if (first.length >= MIN_FIRST_WORD) index.first.set(`${row.kind}:${first}`, categoryId);
  }
  return index;
}

/** Descrição inteira primeiro; a primeira palavra só como segunda tentativa. */
export function suggestCategory(
  index: CategoryIndex,
  description: string,
  kind: TransactionKind,
): Ulid | null {
  const key = normalizeDescription(description, false);
  if (key === "") return null;
  const exact = index.full.get(`${kind}:${key}`);
  if (exact !== undefined) return exact;
  const first = key.split(" ")[0] ?? "";
  if (first.length < MIN_FIRST_WORD) return null;
  return index.first.get(`${kind}:${first}`) ?? null;
}
