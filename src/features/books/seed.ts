import { buildRow } from "../../data/repository";
import type { RowClock } from "../../domain/clock/row-clock";
import { buildDefaultRows } from "../../domain/defaults/defaults";
import type { AppState, RowsByTable } from "../../domain/model/app-state";
import { type BookAccount, BUSINESS_BOOK_ID } from "../../domain/model/book-account";
import type { ColorToken, IconKey } from "../../domain/model/tokens";

/** O que a pessoa escolhe no assistente; o resto da conta é o catálogo do comércio. */
export interface BusinessDraft {
  name: string;
  color: ColorToken;
  icon: IconKey;
}

/**
 * Monta o lote da criação da conta comercial; não grava. Quem grava é a store,
 * numa transação só: a linha `books` e o catálogo de comércio têm que existir
 * juntos, senão a conta nasceria sem categoria nenhuma.
 *
 * O padrão tem id estável por conta (`default:business:…`). Ele pode **já estar**
 * no banco (veio do hub antes, ou outro aparelho criou a conta primeiro), e gravar
 * a semente por cima desfaria a renomeação que chegou. Por isso olha o estado
 * completo (a conta ativa, na hora da criação, é a pessoal e esconderia o padrão
 * comercial) e só inclui o que ainda não existe, inclusive lápide: apagar um
 * padrão é decisão de alguém.
 */
export function buildBusinessAccountRows(
  draft: BusinessDraft,
  clock: RowClock,
  full: AppState,
): RowsByTable {
  const defaults = buildDefaultRows("business");
  return {
    // Id estável por `kind`: dois aparelhos que criam a conta convergem na mesma linha.
    books: [
      buildRow<BookAccount>(
        clock,
        { kind: "business", name: draft.name.trim(), color: draft.color, icon: draft.icon },
        BUSINESS_BOOK_ID,
        "business",
      ),
    ],
    categories: defaults.categories.filter((row) => full.categories[row.id] === undefined),
    paymentMethods: defaults.paymentMethods.filter(
      (row) => full.paymentMethods[row.id] === undefined,
    ),
  };
}
