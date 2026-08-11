import { compareHlc } from "../clock/hlc";
import type { Transaction } from "../events/transaction";
import { CURRENT_SCHEMA_VERSION, type DomainEvent } from "../events/types";
import type { Ulid } from "../ids/ulid";
import { type BucketName, ENTITY_SPECS, type EntityRecordBase, type EntitySpec } from "./entities";

export interface TransactionRecord extends Transaction, EntityRecordBase {}

/**
 * Categoria e forma de pagamento projetam a mesma forma.
 *
 * `kind` é `string` alargada nas duas, e não a união fechada de cada uma, pelo
 * mesmo motivo que `color` é: o log é eterno e sincroniza com aparelhos de
 * versão mais nova. O fold já rejeita `kind` fora da lista e deixa o padrão da
 * casca no lugar; estreitar o tipo aqui obrigaria um cast em toda leitura da
 * projeção, que é o oposto do que os buckets tipados existem para dar.
 */
export interface ReferenceRecord extends EntityRecordBase {
  name: string;
  icon: string;
  color: string;
  kind: string;
}

/** `kind` é `'expense' | 'income' | 'both'`. */
export type CategoryRecord = ReferenceRecord;

/** `kind` é `'cash' | 'pix' | 'credit' | 'debit' | 'other'`. */
export type PaymentMethodRecord = ReferenceRecord;

export interface UserRecord extends EntityRecordBase {
  name: string;
  color: string;
  avatar: string | null;
}

/**
 * Série recorrente. Campos de regra são `string`/`number` alargados pelo mesmo
 * motivo que `kind` em categoria: o fold rejeita o inválido e mantém o shell.
 */
export interface RecurrenceRecord extends EntityRecordBase {
  kind: string;
  description: string;
  amountMinor: number;
  currency: string;
  categoryId: Ulid | null;
  paymentMethodId: Ulid | null;
  cashbackMinor: number | null;
  frequency: string;
  scheduleType: string;
  scheduleN: number;
  startOn: string;
  endOn: string | null;
  active: boolean;
}

export interface ProjectionState {
  transactions: Record<Ulid, TransactionRecord>;
  categories: Record<Ulid, CategoryRecord>;
  paymentMethods: Record<Ulid, PaymentMethodRecord>;
  users: Record<Ulid, UserRecord>;
  recurrences: Record<Ulid, RecurrenceRecord>;
  /**
   * Maior HLC já aplicado, inclusive de eventos ignorados. É o que decide entre
   * aplicar incremental e refoldar. Avançar demais só força refold — que é sempre
   * correto, só mais lento. Avançar de menos aplicaria um evento fora de ordem.
   */
  lastHlc: string | null;
}

export const EMPTY_STATE: ProjectionState = {
  transactions: {},
  categories: {},
  paymentMethods: {},
  users: {},
  recurrences: {},
  lastHlc: null,
};

/**
 * LWW por campo: só sobrescreve o campo se este evento for mais novo que o último
 * que o tocou.
 *
 * O `>=` importa. Quando dois eventos distintos têm HLC idêntico — o que acontece
 * ao restaurar o mesmo backup em dois aparelhos — `compareEvents` já os colocou em
 * ordem total pelo `id`, e aqui o **primeiro aplicado vence**, ou seja, o de menor
 * `id`. Qual dos dois vence é arbitrário; o que não pode variar é a resposta.
 *
 * Existe **uma** cópia disto, para as quatro entidades. Uma por entidade seria a
 * maneira mais barata de quebrar a convergência sem nenhum teste ficar vermelho:
 * a quarta cópia é a que esqueceria o `>=` ou o desempate.
 */
function mergeFields(
  record: EntityRecordBase,
  spec: EntitySpec,
  data: Record<string, unknown>,
  hlc: string,
): EntityRecordBase {
  const next: EntityRecordBase = { ...record, fieldHlc: { ...record.fieldHlc } };

  for (const field of spec.fields) {
    if (!(field in data)) continue;

    const value = data[field];
    if (!spec.isValidField(field, value)) continue;

    const previous = next.fieldHlc[field];
    if (previous !== undefined && previous >= hlc) continue;

    Object.assign(next, { [field]: value });
    next.fieldHlc[field] = hlc;
  }

  return next;
}

/**
 * O único cast do módulo, e a razão dele.
 *
 * `ProjectionState` tem buckets **nomeados e tipados** de propósito: é o que faz
 * `noUncheckedIndexedAccess` proteger os seletores e o que evita cast em toda
 * leitura da projeção. O preço é aqui: com `bucket` só conhecido em runtime, o
 * TypeScript não consegue provar que o registro casa com aquele bucket específico.
 *
 * A garantia é estrutural e vem do `EntitySpec`: `spec.shell` e `spec.fields` do
 * mesmo spec produzem exatamente a forma do bucket para onde `spec.bucket` aponta.
 * Um spec com `bucket` errado é o único jeito de furar isto — e o teste
 * "cada spec aponta para um bucket distinto" existe por causa disso.
 */
function writeBucket(
  state: ProjectionState,
  bucket: BucketName,
  entityId: Ulid,
  record: EntityRecordBase,
): ProjectionState {
  const current = state[bucket] as Record<Ulid, EntityRecordBase>;
  return { ...state, [bucket]: { ...current, [entityId]: record } } as ProjectionState;
}

export function apply(state: ProjectionState, event: DomainEvent): ProjectionState {
  const lastHlc =
    state.lastHlc === null || compareHlc(event.hlc, state.lastHlc) > 0 ? event.hlc : state.lastHlc;
  const unchanged: ProjectionState = { ...state, lastHlc };

  if (event.schemaVersion > CURRENT_SCHEMA_VERSION) return unchanged;

  // Entidade fora do registro devolve `unchanged`. Compatibilidade para frente,
  // não defensividade: um aparelho com versão mais nova emitindo `investment`
  // não pode derrubar o fold deste.
  const spec = ENTITY_SPECS[event.entity];
  if (spec === undefined) return unchanged;

  const bucket = state[spec.bucket] as Record<Ulid, EntityRecordBase>;
  const current = bucket[event.entityId] ?? spec.shell(event.entityId);
  let next: EntityRecordBase;

  switch (event.action) {
    case "create":
      next = { ...mergeFields(current, spec, event.data, event.hlc), materialized: true };
      break;
    case "update":
      next = mergeFields(current, spec, event.data, event.hlc);
      break;
    case "delete":
      next = { ...current, deleted: true };
      break;
  }

  return writeBucket(unchanged, spec.bucket, event.entityId, next);
}

/**
 * Ordem total sobre eventos. O HLC decide quase sempre; o `id` desempata.
 *
 * Sem o desempate, `sort` estável devolve a ordem de chegada quando dois HLCs
 * empatam, e dois aparelhos que receberam os mesmos eventos em ordens diferentes
 * divergem em silêncio. HLC empatado não é hipótese remota: restaurar o mesmo
 * backup em dois aparelhos faz os dois herdarem o mesmo `deviceId` e o mesmo
 * relógio, e o próximo evento de cada um nasce com HLC idêntico.
 */
function compareEvents(a: DomainEvent, b: DomainEvent): number {
  const byHlc = compareHlc(a.hlc, b.hlc);
  if (byHlc !== 0) return byHlc;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Ordem total por HLC antes de reduzir. É o que torna o fold determinístico. */
export function fold(events: DomainEvent[]): ProjectionState {
  return [...events].sort(compareEvents).reduce(apply, EMPTY_STATE);
}
