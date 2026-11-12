import { formatHlc } from "../clock/hlc";
import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import { type Book, DEFAULT_BOOK } from "../model/book";
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
 * Id estável de um padrão. A conta pessoal mantém a semente de sempre
 * (`default:categories:food`): esses ids já existem em aparelhos e no hub, e
 * mudá-los duplicaria todo padrão. Só as outras contas levam o `book` no id
 * (`default:business:categories:sales`), para o padrão de uma conta nunca
 * colidir com o da outra nem ser fundido nela.
 */
export function defaultId(table: string, key: string, book: Book = DEFAULT_BOOK): Ulid {
  const scope = book === DEFAULT_BOOK ? "" : `${book}:`;
  return stableEntityId(`default:${scope}${table}:${key}`);
}

/**
 * A chave do id é interna e não o nome exibido: o nome é editável, e um id
 * derivado dele mudaria a cada tradução ou ajuste de grafia da lista.
 */
function entry<D>(
  table: string,
  key: string,
  draft: D,
  book: Book = DEFAULT_BOOK,
): DefaultEntry<D> {
  return { id: defaultId(table, key, book), draft };
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
 * Padrões que a semente **não** cria mais, mas que o planejador de fusão ainda
 * precisa conhecer. O "Cartão de crédito" genérico juntava o gasto de todo
 * cartão num só; cada cartão agora é um cadastro com banco e fechamento. A
 * linha continua na lista acima porque aparelhos na versão velha ainda
 * semeiam cópias dela com id aleatório, e sem ela a fusão deixaria de levá-las
 * para o id estável (e o gatilho da migração de cartões veria cópias soltas).
 */
const UNSEEDED_METHOD_KEYS: readonly string[] = ["credit"];

const UNSEEDED_METHOD_IDS: ReadonlySet<string> = new Set(
  UNSEEDED_METHOD_KEYS.map((key) => defaultId("paymentMethods", key)),
);

/** O id estável do genérico antigo, para a migração reconhecer a linha. */
export const LEGACY_CREDIT_METHOD_ID: Ulid = defaultId("paymentMethods", "credit");

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

function genesisRow<T>(item: DefaultEntry<object>, book: Book): T {
  return {
    ...item.draft,
    // A pessoal sai sem `book`, como as sementes que os aparelhos já gravaram:
    // a linha segue idêntica byte a byte em todo aparelho e no hub.
    ...(book === DEFAULT_BOOK ? {} : { book }),
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

/** Os padrões de uma conta: o que a semente cria e o que o planejador de fusão conhece. */
export interface DefaultCatalog {
  categories: readonly DefaultEntry<CategoryDraft>[];
  methods: readonly DefaultEntry<PaymentMethodDraft>[];
}

/**
 * Categorias do comércio, pelo mesmo critério da lista pessoal (curta, cadastros
 * comuns, apagáveis). Só `income` e `expense`: `both` é da pessoal (investimento e
 * transferência), e o capital do negócio mora em bens, não em categoria.
 */
export const BUSINESS_CATEGORIES: readonly DefaultEntry<CategoryDraft>[] = [
  entry(
    "categories",
    "sales",
    { name: "Vendas", icon: "shopping-bag", color: "emerald", kind: "income" },
    "business",
  ),
  entry(
    "categories",
    "other-income",
    { name: "Outras receitas", icon: "banknote", color: "teal", kind: "income" },
    "business",
  ),
  entry(
    "categories",
    "suppliers",
    { name: "Fornecedores", icon: "shopping-cart", color: "orange", kind: "expense" },
    "business",
  ),
  entry(
    "categories",
    "rent",
    { name: "Aluguel", icon: "house", color: "amber", kind: "expense" },
    "business",
  ),
  entry(
    "categories",
    "taxes",
    { name: "Impostos", icon: "landmark", color: "slate", kind: "expense" },
    "business",
  ),
  entry(
    "categories",
    "staff",
    { name: "Funcionários", icon: "briefcase", color: "indigo", kind: "expense" },
    "business",
  ),
  entry(
    "categories",
    "marketing",
    { name: "Marketing", icon: "smartphone", color: "fuchsia", kind: "expense" },
    "business",
  ),
  entry(
    "categories",
    "equipment",
    { name: "Equipamentos", icon: "laptop", color: "sky", kind: "expense" },
    "business",
  ),
  // Água, luz e internet: o nome curto cabe no azulejo da grade.
  entry(
    "categories",
    "bills",
    { name: "Contas", icon: "receipt", color: "slate", kind: "expense" },
    "business",
  ),
  entry(
    "categories",
    "other-expense",
    { name: "Outras despesas", icon: "tag", color: "rose", kind: "expense" },
    "business",
  ),
];

/**
 * Formas de pagamento do comércio. Boleto não tem tipo próprio (`PAYMENT_KINDS` é
 * dinheiro, pix, crédito, débito e outro), então é `other`: nenhum tipo afirma
 * algo errado sobre ele. O crédito sai sem banco nem fechamento, como todo
 * `credit` genérico: usar pela primeira vez abre "Ajustar cartões".
 */
export const BUSINESS_METHODS: readonly DefaultEntry<PaymentMethodDraft>[] = [
  entry(
    "paymentMethods",
    "pix",
    { name: "Pix", icon: "zap", color: "teal", kind: "pix" },
    "business",
  ),
  entry(
    "paymentMethods",
    "cash",
    { name: "Dinheiro", icon: "banknote", color: "emerald", kind: "cash" },
    "business",
  ),
  entry(
    "paymentMethods",
    "debit",
    { name: "Cartão de débito", icon: "credit-card", color: "sky", kind: "debit" },
    "business",
  ),
  entry(
    "paymentMethods",
    "credit",
    { name: "Cartão de crédito", icon: "credit-card", color: "violet", kind: "credit" },
    "business",
  ),
  entry(
    "paymentMethods",
    "boleto",
    { name: "Boleto", icon: "receipt", color: "amber", kind: "other" },
    "business",
  ),
];

/**
 * Padrões por conta. O catálogo comercial só vira linha quando a conta é criada
 * (`buildDefaultRows("business")` no assistente): a pessoal é semeada no primeiro
 * uso, a comercial nunca é semeada sozinha. `planDefaultsMerge` conhece os dois e
 * funde cada conta no catálogo dela, sem cruzar.
 */
export const DEFAULTS_BY_BOOK: Record<Book, DefaultCatalog> = {
  personal: { categories: DEFAULT_CATEGORIES, methods: DEFAULT_METHODS },
  business: { categories: BUSINESS_CATEGORIES, methods: BUSINESS_METHODS },
};

/** As linhas da semente de uma conta. Sem relógio: não dependem de quando nem de onde. */
export function buildDefaultRows(
  book: Book = DEFAULT_BOOK,
  catalog: DefaultCatalog = DEFAULTS_BY_BOOK[book],
): { categories: Category[]; paymentMethods: PaymentMethod[] } {
  const unseeded = book === DEFAULT_BOOK ? UNSEEDED_METHOD_IDS : new Set<string>();
  return {
    categories: catalog.categories.map((c) => genesisRow<Category>(c, book)),
    paymentMethods: catalog.methods
      .filter((m) => !unseeded.has(m.id))
      .map((m) => genesisRow<PaymentMethod>(m, book)),
  };
}
