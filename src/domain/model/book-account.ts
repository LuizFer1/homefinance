import { stableEntityId } from "../ids/stable-id";
import { type BaseRow, type Draft, isAlive } from "./base";
import type { Book, BookScoped } from "./book";
import type { ColorToken, IconKey } from "./tokens";

/** Id da linha da conta comercial: o mesmo em qualquer aparelho (ver `BookAccount`). */
export const BUSINESS_BOOK_ID = stableEntityId("book:business");

/**
 * Cadastro da conta comercial: nome, cor e ícone do negócio **sincronizados**
 * (a `meta` é local). Só existe a linha `business`; a conta pessoal é implícita.
 *
 * O id é estável por `kind` (`BUSINESS_BOOK_ID`): dois aparelhos que criam a conta
 * comercial convergem para a mesma linha em vez de trazer duas pelo hub.
 */
export interface BookAccount extends BaseRow, BookScoped {
  kind: Book;
  name: string;
  color: ColorToken;
  icon: IconKey;
}

export type BookAccountDraft = Draft<BookAccount>;

/**
 * A conta comercial **viva** deste estado, ou nulo. É a pergunta "esta pessoa tem
 * conta comercial?", derivada do estado e não de um flag local: um aparelho que
 * recebeu a linha pelo sync já mostra a conta, e uma linha apagada some.
 *
 * Prefere a linha de id estável; se só há outra com `kind: "business"` (uma
 * versão futura que mudou o id), vale a primeira, em ordem de id, para duas
 * telas nunca discordarem sobre qual é.
 */
export function findBusinessBook(state: {
  books: Record<string, BookAccount>;
}): BookAccount | null {
  const stable = state.books[BUSINESS_BOOK_ID];
  if (isAlive(stable) && stable.kind === "business") return stable;
  const others = Object.values(state.books)
    .filter((row) => isAlive(row) && row.kind === "business")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return others[0] ?? null;
}
