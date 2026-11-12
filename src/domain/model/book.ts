/**
 * A conta (livro) a que uma linha pertence. Pessoal e comercial moram no mesmo
 * banco e no mesmo hub; o que separa as duas é este campo na linha, e não um
 * banco por conta (o sync trabalha com linhas inteiras).
 */
export const BOOKS = ["personal", "business"] as const;
export type Book = (typeof BOOKS)[number];

export const DEFAULT_BOOK: Book = "personal";

/**
 * Coluna opcional das linhas que pertencem a uma conta. Opcional porque as
 * linhas gravadas antes dela (no aparelho e no hub) seguem válidas: ausente
 * vale `personal`.
 */
export interface BookScoped {
  book?: Book | null;
}

export function isBook(value: unknown): value is Book {
  return typeof value === "string" && (BOOKS as readonly string[]).includes(value);
}

/**
 * A conta de uma linha. Ausente, `null` e valor desconhecido (uma conta que só
 * uma versão futura conhece, chegando por sync) caem em `personal`: degradar é
 * melhor que derrubar a tela, e a linha desconhecida nunca some do banco.
 */
export function bookOf(row: { book?: unknown } | null | undefined): Book {
  const value = row?.book;
  return isBook(value) ? value : DEFAULT_BOOK;
}
