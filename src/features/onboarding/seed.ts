import { buildRow } from "../../data/repository";
import type { RowClock } from "../../domain/clock/row-clock";
import type { RowsByTable } from "../../domain/model/app-state";
import type { Category, CategoryDraft } from "../../domain/model/category";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
import type { User, UserDraft } from "../../domain/model/user";
import { LOCAL_USER_ID_KEY, type SessionMeta } from "../session/session";

/**
 * Os quatro padrão são cadastros comuns, não constantes: dá para renomear
 * "Pix" para "Pix Nubank", trocar a cor e apagar o que não usa. Constantes
 * embutidas virariam caso especial em toda tela e não sobreviveriam ao primeiro
 * usuário que quisesse dois cartões.
 */
const DEFAULT_METHODS: readonly PaymentMethodDraft[] = [
  { name: "Dinheiro", icon: "banknote", color: "emerald", kind: "cash" },
  { name: "Pix", icon: "zap", color: "teal", kind: "pix" },
  { name: "Cartão de crédito", icon: "credit-card", color: "violet", kind: "credit" },
  { name: "Cartão de débito", icon: "credit-card", color: "sky", kind: "debit" },
];

/**
 * Categorias padrão, pelo mesmo argumento dos métodos: cadastros comuns, não
 * constantes. São renomeáveis, recoloríveis e apagáveis.
 *
 * A lista é curta de propósito. Um app que abre com trinta categorias obriga o
 * usuário a fazer faxina antes de lançar o primeiro gasto, e a faxina é trabalho
 * que ninguém pediu. Falta alguma? O cadastro está em Ajustes → Categorias.
 *
 * `both` só para investimento e transferência, que são genuinamente os dois
 * lados — não é o padrão desta lista, é a exceção que justifica o valor existir.
 */
const DEFAULT_CATEGORIES: readonly CategoryDraft[] = [
  { name: "Alimentação", icon: "utensils", color: "orange", kind: "expense" },
  { name: "Moradia", icon: "house", color: "amber", kind: "expense" },
  { name: "Transporte", icon: "car", color: "sky", kind: "expense" },
  { name: "Saúde", icon: "health", color: "rose", kind: "expense" },
  { name: "Educação", icon: "graduation", color: "indigo", kind: "expense" },
  { name: "Lazer", icon: "film", color: "violet", kind: "expense" },
  { name: "Compras", icon: "shopping-bag", color: "fuchsia", kind: "expense" },
  { name: "Contas", icon: "receipt", color: "slate", kind: "expense" },
  { name: "Salário", icon: "banknote", color: "emerald", kind: "income" },
  { name: "Renda extra", icon: "briefcase", color: "teal", kind: "income" },
  { name: "Investimentos", icon: "piggy-bank", color: "lime", kind: "both" },
  { name: "Transferência", icon: "landmark", color: "slate", kind: "both" },
];

export interface OnboardingRows {
  rows: RowsByTable;
  /** Mesmo tipo de `putRows`, reaproveitado para o compilador amarrar os dois. */
  meta: SessionMeta;
}

/** Monta o lote; não grava. Quem grava é a store, numa transação só. */
export function buildOnboardingRows(draft: UserDraft, clock: RowClock): OnboardingRows {
  const user = buildRow<User>(clock, draft);
  return {
    rows: {
      users: [user],
      paymentMethods: DEFAULT_METHODS.map((m) => buildRow<PaymentMethod>(clock, m)),
      categories: DEFAULT_CATEGORIES.map((c) => buildRow<Category>(clock, c)),
    },
    meta: { [LOCAL_USER_ID_KEY]: user.id },
  };
}
