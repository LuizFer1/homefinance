import type { Ulid } from "../ids/ulid";
import { CURRENT_SCHEMA_VERSION, type DomainEvent, type EntityKind } from "./types";

/**
 * Paleta fechada, não hex livre. Hex livre deixa o usuário escolher cinza sobre
 * cinza, quebra o contraste no tema escuro e não é validável. O valor persistido
 * é o nome; a resolução para `oklch` vive no `app.css`, com um valor por tema.
 */
export type ColorToken =
  | "slate"
  | "rose"
  | "red"
  | "orange"
  | "amber"
  | "lime"
  | "emerald"
  | "teal"
  | "sky"
  | "indigo"
  | "violet"
  | "fuchsia";

/**
 * Carrega significado que o nome não carrega: é ele que faz o formulário da
 * fatia 3 saber que deve oferecer cashback, e sobrevive ao usuário renomear
 * "Pix" para "Pix Nubank". Sem ele, a regra de cashback dependeria de casar
 * string com o nome que o usuário escolheu.
 */
export type PaymentKind = "cash" | "pix" | "credit" | "debit" | "other";

/**
 * A que lado do lançamento a categoria serve.
 *
 * `both` existe e é o padrão de categoria nova. Investimentos e transferências
 * são legitimamente os dois, e um padrão que escondesse a categoria de um dos
 * formulários faria o usuário concluir que ela sumiu. Esconder por engano é pior
 * que oferecer demais: a lista longa incomoda, a categoria invisível parece bug.
 */
export type CategoryKind = "expense" | "income" | "both";

/** Chave no mapa estático de `features/icons`. Chave desconhecida cai num neutro. */
export type IconKey = string;

/**
 * O que categoria e forma de pagamento têm em comum.
 *
 * As duas têm `kind`, mas de tipos diferentes e com significados diferentes —
 * por isso `PaymentMethod` **não** estende `Category`. Estendia, até categoria
 * ganhar tipo próprio; manter a herança obrigaria os dois `kind` a serem o mesmo
 * conjunto de valores, e a forma de pagamento passaria a aceitar "income".
 */
export interface ReferenceEntity {
  id: Ulid;
  name: string;
  icon: IconKey;
  color: ColorToken;
}

export interface Category extends ReferenceEntity {
  kind: CategoryKind;
}

export interface PaymentMethod extends ReferenceEntity {
  kind: PaymentKind;
}

/**
 * Forma alargada do agregado, para leitura.
 *
 * A projecao guarda `icon`, `color` e `kind` como `string` de proposito: o log
 * e eterno e sincroniza com aparelhos de versao mais nova, entao um token
 * desconhecido precisa sobreviver ao fold em vez de ser apagado. O `diff` so
 * compara valores, entao ele aceita a forma alargada — estreitar aqui obrigaria
 * um cast em toda leitura da projecao, que e o oposto do que os buckets tipados
 * existem para dar.
 */
export interface ReferenceLike {
  name: string;
  icon: string;
  color: string;
  kind: string;
}

export type CategoryLike = ReferenceLike;
export type PaymentMethodLike = ReferenceLike;

export type CategoryDraft = Omit<Category, "id">;
export type CategoryPatch = Partial<CategoryDraft>;
export type PaymentMethodDraft = Omit<PaymentMethod, "id">;
export type PaymentMethodPatch = Partial<PaymentMethodDraft>;

export interface Envelope {
  eventId: Ulid;
  entityId: Ulid;
  deviceId: Ulid;
  hlc: string;
}

/**
 * Monta o envelope do evento. `eventId` vira `id` e o resto do envelope não
 * vaza para o registro gravado — o log é eterno, e campo a mais nele é
 * permanente.
 */
export function referenceEvent(
  envelope: Envelope,
  entity: EntityKind,
  action: DomainEvent["action"],
  data: Record<string, unknown>,
): DomainEvent {
  return {
    id: envelope.eventId,
    entity,
    entityId: envelope.entityId,
    action,
    data,
    deviceId: envelope.deviceId,
    hlc: envelope.hlc,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export function categoryCreated(args: Envelope & { draft: CategoryDraft }): DomainEvent {
  return referenceEvent(args, "category", "create", {
    name: args.draft.name,
    icon: args.draft.icon,
    color: args.draft.color,
    kind: args.draft.kind,
  });
}

export function categoryUpdated(args: Envelope & { patch: CategoryPatch }): DomainEvent {
  return referenceEvent(args, "category", "update", { ...args.patch });
}

export function categoryDeleted(args: Envelope): DomainEvent {
  return referenceEvent(args, "category", "delete", {});
}

export function paymentMethodCreated(args: Envelope & { draft: PaymentMethodDraft }): DomainEvent {
  return referenceEvent(args, "paymentMethod", "create", {
    name: args.draft.name,
    icon: args.draft.icon,
    color: args.draft.color,
    kind: args.draft.kind,
  });
}

export function paymentMethodUpdated(args: Envelope & { patch: PaymentMethodPatch }): DomainEvent {
  return referenceEvent(args, "paymentMethod", "update", { ...args.patch });
}

export function paymentMethodDeleted(args: Envelope): DomainEvent {
  return referenceEvent(args, "paymentMethod", "delete", {});
}

/**
 * Campos alterados, nunca o agregado inteiro. Emitir tudo num `update`
 * transformaria o patch parcial num documento disfarçado e faria o LWW por campo
 * perder edições concorrentes sem nenhum sintoma visível: duas pessoas editando
 * campos diferentes offline, e uma das edições some no merge.
 */
/**
 * Os três campos que categoria e forma de pagamento comparam igual. Genérico
 * para preservar `ColorToken` e `IconKey` no patch: um retorno de `string`
 * alargaria o tipo e deixaria o hex livre passar pela porta dos fundos.
 */
function diffAppearance<T extends { name: string; icon: IconKey; color: ColorToken }>(
  current: ReferenceLike,
  next: T,
): Partial<T> {
  const patch = {} as Partial<T>;
  if (current.name !== next.name) patch.name = next.name;
  if (current.icon !== next.icon) patch.icon = next.icon;
  if (current.color !== next.color) patch.color = next.color;
  return patch;
}

export function diffCategory(current: CategoryLike, next: CategoryDraft): CategoryPatch {
  const patch: CategoryPatch = diffAppearance(current, next);
  if (current.kind !== next.kind) patch.kind = next.kind;
  return patch;
}

export function diffPaymentMethod(
  current: PaymentMethodLike,
  next: PaymentMethodDraft,
): PaymentMethodPatch {
  const patch: PaymentMethodPatch = diffAppearance(current, next);
  if (current.kind !== next.kind) patch.kind = next.kind;
  return patch;
}
