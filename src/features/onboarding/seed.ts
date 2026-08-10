import type { DeviceClock } from "../../domain/clock/device-clock";
import type { CategoryDraft, PaymentMethodDraft } from "../../domain/events/reference";
import { categoryCreated, paymentMethodCreated } from "../../domain/events/reference";
import type { DomainEvent } from "../../domain/events/types";
import type { UserDraft } from "../../domain/events/user";
import { userCreated } from "../../domain/events/user";
import { LOCAL_USER_ID_KEY } from "../session/session";

/**
 * Os quatro padrão são **eventos comuns**, não constantes: dá para renomear
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
 * Categorias padrão, pelo mesmo argumento dos métodos: eventos comuns, não
 * constantes. São renomeáveis, recoloríveis e apagáveis.
 *
 * A lista é curta de propósito. Um app que abre com trinta categorias obriga o
 * usuário a fazer faxina antes de lançar o primeiro gasto, e a faxina é trabalho
 * que ninguém pediu. Falta alguma? "Nova categoria" está na tela de Início.
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

export interface OnboardingBatch {
  events: DomainEvent[];
  meta: Record<string, string>;
}

/**
 * Monta o lote; não escreve nada.
 *
 * Quem escreve é a store, com `commitBatch`. Separar assim é o que torna a ordem
 * e o conteúdo do lote testáveis sem `fake-indexeddb`, e é o que permite afirmar
 * num teste que todos os eventos nascem com HLCs distintos e crescentes — a
 * garantia que impede alguém contornar o relógio montando envelopes na mão.
 *
 * O perfil vem antes do resto porque um lote interrompido não pode deixar
 * cadastros existindo sem o perfil que os semeou. Na prática a escrita é atômica
 * e nunca chega interrompida; a ordem é a segunda linha de defesa.
 */
export function buildOnboardingBatch(draft: UserDraft, clock: DeviceClock): OnboardingBatch {
  const user = clock.newEntity();

  return {
    events: [
      userCreated({ ...user, draft }),
      ...DEFAULT_METHODS.map((method) =>
        paymentMethodCreated({ ...clock.newEntity(), draft: method }),
      ),
      ...DEFAULT_CATEGORIES.map((category) =>
        categoryCreated({ ...clock.newEntity(), draft: category }),
      ),
    ],
    meta: { [LOCAL_USER_ID_KEY]: user.entityId },
  };
}
