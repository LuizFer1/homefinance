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

/** Chave no mapa estático de `features/icons`. Chave desconhecida cai num neutro. */
export type IconKey = string;

export interface Category {
  id: Ulid;
  name: string;
  icon: IconKey;
  color: ColorToken;
}

export interface PaymentMethod extends Category {
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
export interface CategoryLike {
  name: string;
  icon: string;
  color: string;
}

export interface PaymentMethodLike extends CategoryLike {
  kind: string;
}

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
export function diffCategory(current: CategoryLike, next: CategoryDraft): CategoryPatch {
  const patch: CategoryPatch = {};
  if (current.name !== next.name) patch.name = next.name;
  if (current.icon !== next.icon) patch.icon = next.icon;
  if (current.color !== next.color) patch.color = next.color;
  return patch;
}

export function diffPaymentMethod(
  current: PaymentMethodLike,
  next: PaymentMethodDraft,
): PaymentMethodPatch {
  const patch: PaymentMethodPatch = { ...diffCategory(current, next) };
  if (current.kind !== next.kind) patch.kind = next.kind;
  return patch;
}
