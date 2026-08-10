import type { EntityKind } from "../events/types";
import type { Ulid } from "../ids/ulid";

export type BucketName = "transactions" | "categories" | "paymentMethods" | "users";

/**
 * O que `apply` precisa saber de qualquer entidade.
 *
 * Os campos de domínio são opacos para ele de propósito: é isso que permite um
 * `mergeFields` só. Uma cópia do LWW por campo por entidade seria a maneira mais
 * barata de quebrar a convergência sem nenhum teste ficar vermelho.
 */
export interface EntityRecordBase {
  id: Ulid;
  /** Tombstone. Terminal: uma vez verdadeiro, nunca volta a falso. */
  deleted: boolean;
  /** Falso enquanto só chegaram update ou delete órfãos. Invisível na UI. */
  materialized: boolean;
  /** HLC do último evento que tocou cada campo. Vive só na projeção, nunca no log. */
  fieldHlc: Record<string, string>;
}

export interface EntitySpec {
  readonly fields: readonly string[];
  readonly isValidField: (field: string, value: unknown) => boolean;
  readonly shell: (id: Ulid) => EntityRecordBase;
  readonly bucket: BucketName;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Data real, não só formato: mês 13 e 31 de fevereiro viram mês fantasma no histórico. */
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;

  const [, yearText, monthText, dayText] = match;
  if (yearText === undefined || monthText === undefined || dayText === undefined) return false;

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1) return false;

  const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const limit = month === 2 && leapYear ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  return day <= limit;
}

/**
 * Os doze tokens da paleta fechada. Existe para o **formulário oferecer as
 * opções**, não para o fold filtrar — ver `isToken` logo abaixo.
 */
export const COLOR_TOKENS = [
  "slate",
  "rose",
  "red",
  "orange",
  "amber",
  "lime",
  "emerald",
  "teal",
  "sky",
  "indigo",
  "violet",
  "fuchsia",
] as const;

/**
 * Neutro da paleta. É o destino de todo token que não pode ser confiado: o
 * desconhecido vindo de uma versão futura via sync, e as agregações que não
 * têm categoria própria de onde tirar cor.
 *
 * Mora aqui, junto de `COLOR_TOKENS`, porque a projeção e a UI precisam
 * concordar sobre ele — em dois lugares, trocar o neutro num deixaria o outro
 * desalinhado sem nada avisar.
 */
export const NEUTRAL_TOKEN = "slate";

export const PAYMENT_KINDS = ["cash", "pix", "credit", "debit", "other"] as const;

/**
 * A que lado do lançamento a categoria serve. `both` é o padrão e o destino de
 * todo valor que não pode ser confiado — ver `CATEGORY_SPEC` logo abaixo.
 */
export const CATEGORY_KINDS = ["expense", "income", "both"] as const;

/**
 * Cor e ícone são validados como **string não vazia**, não contra a lista.
 *
 * O log é eterno e sincroniza com aparelhos de versão mais nova: rejeitar um
 * token desconhecido aqui apagaria o campo do registro do usuário para sempre.
 * O fallback para neutro é decisão de renderização, e mora na UI.
 *
 * `kind` da forma de pagamento é o oposto e é validado contra a lista: ele
 * carrega regra de produto — é ele que decide se o formulário oferece cashback —,
 * então valor fora da lista mudaria comportamento, não só aparência.
 */
function isToken(value: unknown): boolean {
  return typeof value === "string" && value !== "";
}

function isValidTransactionField(field: string, value: unknown): boolean {
  switch (field) {
    case "kind":
      return value === "income" || value === "expense";
    case "description":
      return typeof value === "string";
    case "amountMinor":
      return typeof value === "number" && Number.isInteger(value);
    case "currency":
      return value === "BRL";
    case "categoryId":
    case "paymentMethodId":
    case "userId":
      return value === null || typeof value === "string";
    case "cashbackMinor":
      return value === null || (typeof value === "number" && Number.isInteger(value));
    case "occurredOn":
      return typeof value === "string" && isRealDate(value);
    default:
      return false;
  }
}

function isValidReferenceField(field: string, value: unknown): boolean {
  switch (field) {
    case "name":
      return typeof value === "string";
    case "icon":
    case "color":
      return isToken(value);
    default:
      return false;
  }
}

export const TRANSACTION_SPEC: EntitySpec = {
  bucket: "transactions",
  fields: [
    "kind",
    "description",
    "amountMinor",
    "currency",
    "categoryId",
    "paymentMethodId",
    "cashbackMinor",
    "occurredOn",
    "userId",
  ],
  isValidField: isValidTransactionField,
  shell: (id) => ({
    id,
    kind: "expense",
    description: "",
    amountMinor: 0,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: "",
    userId: null,
    deleted: false,
    materialized: false,
    fieldHlc: {},
  }),
};

/**
 * `kind` da categoria segue a mesma regra do `kind` da forma de pagamento e o
 * oposto de cor e ícone: é validado **contra a lista**, porque carrega regra de
 * produto — é ele que decide se o formulário de despesa oferece a categoria.
 * Valor fora da lista mudaria comportamento, não só aparência.
 *
 * Rejeitado no fold, o campo cai no padrão da casca: `both`. É o único fallback
 * seguro — esconder a categoria de um dos formulários por causa de um valor
 * desconhecido vindo do sync faria ela parecer apagada.
 */
function isValidCategoryField(field: string, value: unknown): boolean {
  return field === "kind"
    ? typeof value === "string" && (CATEGORY_KINDS as readonly string[]).includes(value)
    : isValidReferenceField(field, value);
}

export const CATEGORY_SPEC: EntitySpec = {
  bucket: "categories",
  fields: ["name", "icon", "color", "kind"],
  isValidField: isValidCategoryField,
  shell: (id) => ({
    id,
    name: "",
    icon: "tag",
    color: "slate",
    kind: "both",
    deleted: false,
    materialized: false,
    fieldHlc: {},
  }),
};

export const PAYMENT_METHOD_SPEC: EntitySpec = {
  bucket: "paymentMethods",
  fields: ["name", "icon", "color", "kind"],
  isValidField: (field, value) =>
    field === "kind"
      ? typeof value === "string" && (PAYMENT_KINDS as readonly string[]).includes(value)
      : isValidReferenceField(field, value),
  shell: (id) => ({
    id,
    name: "",
    icon: "wallet",
    color: "slate",
    kind: "other",
    deleted: false,
    materialized: false,
    fieldHlc: {},
  }),
};

/**
 * `avatar` é validado como `null | string` e **nada mais** — não contra tamanho,
 * não contra formato. Mesma razão que `isToken` registra acima para os tokens de
 * cor: o log é eterno e sincroniza com aparelhos de versão mais nova, então
 * rejeitar aqui apagaria a foto do registro do usuário para sempre. A lista de
 * permissão de formatos mora na renderização, onde a decisão é reversível.
 */
export const USER_SPEC: EntitySpec = {
  bucket: "users",
  fields: ["name", "color", "avatar"],
  isValidField: (field, value) =>
    field === "avatar"
      ? value === null || typeof value === "string"
      : isValidReferenceField(field, value),
  shell: (id) => ({
    id,
    name: "",
    color: "slate",
    avatar: null,
    deleted: false,
    materialized: false,
    fieldHlc: {},
  }),
};

/**
 * Entidade fora deste registro devolve `unchanged` no `apply`. Isso é
 * compatibilidade para frente, não defensividade: um aparelho com versão mais
 * nova emitindo `investment` não pode derrubar o fold deste.
 */
export const ENTITY_SPECS: Partial<Record<EntityKind, EntitySpec>> = {
  transaction: TRANSACTION_SPEC,
  category: CATEGORY_SPEC,
  paymentMethod: PAYMENT_METHOD_SPEC,
  user: USER_SPEC,
};
