import { formatHlc } from "../clock/hlc";
import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { Category, CategoryDraft } from "../model/category";
import type { PaymentMethod, PaymentMethodDraft } from "../model/payment-method";

/**
 * Carimbo da semente: o menor HLC possível, com o deviceId zerado. A linha
 * padrão sai idêntica byte a byte em todo aparelho — o hub guarda uma só — e
 * qualquer edição ou exclusão de verdade fica acima dela no LWW por linha. Com
 * o HLC do primeiro uso, o aparelho que entrasse por último atropelaria o
 * "Pix Nubank" que a outra pessoa já tinha renomeado.
 */
export const GENESIS_HLC = formatHlc({
  millis: 0,
  counter: 0,
  deviceId: "00000000000000000000000000",
});

const GENESIS_ISO = new Date(0).toISOString();

export interface DefaultEntry<D> {
  id: Ulid;
  draft: D;
}

/**
 * A chave do id é interna e não o nome exibido: o nome é editável, e um id
 * derivado dele mudaria a cada tradução ou ajuste de grafia da lista.
 */
function entry<D>(table: string, key: string, draft: D): DefaultEntry<D> {
  return { id: stableEntityId(`default:${table}:${key}`), draft };
}

/**
 * Os quatro padrão são cadastros comuns, não constantes: dá para renomear
 * "Pix" para "Pix Nubank", trocar a cor e apagar o que não usa. Constantes
 * embutidas virariam caso especial em toda tela e não sobreviveriam ao primeiro
 * usuário que quisesse dois cartões.
 *
 * O id é fixo para dois aparelhos semeados em separado não trazerem cada um sua
 * cópia pelo hub.
 */
export const DEFAULT_METHODS: readonly DefaultEntry<PaymentMethodDraft>[] = [
  entry("paymentMethods", "cash", {
    name: "Dinheiro",
    icon: "banknote",
    color: "emerald",
    kind: "cash",
  }),
  entry("paymentMethods", "pix", { name: "Pix", icon: "zap", color: "teal", kind: "pix" }),
  entry("paymentMethods", "credit", {
    name: "Cartão de crédito",
    icon: "credit-card",
    color: "violet",
    kind: "credit",
  }),
  entry("paymentMethods", "debit", {
    name: "Cartão de débito",
    icon: "credit-card",
    color: "sky",
    kind: "debit",
  }),
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
export const DEFAULT_CATEGORIES: readonly DefaultEntry<CategoryDraft>[] = [
  entry("categories", "food", {
    name: "Alimentação",
    icon: "utensils",
    color: "orange",
    kind: "expense",
  }),
  entry("categories", "housing", {
    name: "Moradia",
    icon: "house",
    color: "amber",
    kind: "expense",
  }),
  entry("categories", "transport", {
    name: "Transporte",
    icon: "car",
    color: "sky",
    kind: "expense",
  }),
  entry("categories", "health", { name: "Saúde", icon: "health", color: "rose", kind: "expense" }),
  entry("categories", "education", {
    name: "Educação",
    icon: "graduation",
    color: "indigo",
    kind: "expense",
  }),
  entry("categories", "leisure", { name: "Lazer", icon: "film", color: "violet", kind: "expense" }),
  entry("categories", "shopping", {
    name: "Compras",
    icon: "shopping-bag",
    color: "fuchsia",
    kind: "expense",
  }),
  entry("categories", "bills", {
    name: "Contas",
    icon: "receipt",
    color: "slate",
    kind: "expense",
  }),
  entry("categories", "salary", {
    name: "Salário",
    icon: "banknote",
    color: "emerald",
    kind: "income",
  }),
  entry("categories", "side-income", {
    name: "Renda extra",
    icon: "briefcase",
    color: "teal",
    kind: "income",
  }),
  entry("categories", "investments", {
    name: "Investimentos",
    icon: "piggy-bank",
    color: "lime",
    kind: "both",
  }),
  entry("categories", "transfer", {
    name: "Transferência",
    icon: "landmark",
    color: "slate",
    kind: "both",
  }),
];

function genesisRow<T>(item: DefaultEntry<object>): T {
  return {
    ...item.draft,
    mergedInto: null,
    id: item.id,
    createdAt: GENESIS_ISO,
    updatedAt: GENESIS_HLC,
    deletedAt: null,
    // Sobe para o hub mesmo assim: o dashboard dele precisa do nome. Como a
    // linha é igual em todo aparelho, reenviar é idempotente.
    dirty: 1,
  } as T;
}

/** As linhas da semente. Sem relógio: não dependem de quando nem de onde. */
export function buildDefaultRows(): { categories: Category[]; paymentMethods: PaymentMethod[] } {
  return {
    categories: DEFAULT_CATEGORIES.map((c) => genesisRow<Category>(c)),
    paymentMethods: DEFAULT_METHODS.map((m) => genesisRow<PaymentMethod>(m)),
  };
}
