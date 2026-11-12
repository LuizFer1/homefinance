import { stableEntityId } from "../ids/stable-id";
import type { BaseRow, Draft } from "./base";
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
