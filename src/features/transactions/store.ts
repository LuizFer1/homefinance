import { type Signal, signal } from "@preact/signals";
import type { EventStore } from "../../data/event-store";
import { createHlcClock, type HlcClock } from "../../domain/clock/hlc";
import {
  type TransactionDraft,
  type TransactionPatch,
  transactionCreated,
  transactionDeleted,
  transactionUpdated,
} from "../../domain/events/transaction";
import type { DomainEvent } from "../../domain/events/types";
import { isValidEvent } from "../../domain/events/validate";
import { createUlidFactory, type RandomChunk, type Ulid } from "../../domain/ids/ulid";
import { apply, EMPTY_STATE, fold, type ProjectionState } from "../../domain/projections/apply";

const DEVICE_ID_KEY = "deviceId";

export type StoreStatus = "loading" | "ready" | "error";

export interface StoreDeps {
  events: EventStore;
  now: () => number;
  randomChunk: RandomChunk;
}

export interface TransactionsStore {
  state: Signal<ProjectionState>;
  status: Signal<StoreStatus>;
  error: Signal<string | null>;
  init: () => Promise<void>;
  add: (draft: TransactionDraft) => Promise<void>;
  edit: (entityId: Ulid, patch: TransactionPatch) => Promise<void>;
  remove: (entityId: Ulid) => Promise<void>;
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function createTransactionsStore(deps: StoreDeps): TransactionsStore {
  const state = signal<ProjectionState>(EMPTY_STATE);
  const status = signal<StoreStatus>("loading");
  const error = signal<string | null>(null);

  const nextUlid = createUlidFactory(deps.randomChunk);
  let log: DomainEvent[] = [];
  let clock: HlcClock | null = null;
  let deviceId: Ulid | null = null;

  async function init(): Promise<void> {
    try {
      const stored = await deps.events.getMeta(DEVICE_ID_KEY);
      deviceId = stored ?? nextUlid(deps.now());
      if (stored === null) await deps.events.setMeta(DEVICE_ID_KEY, deviceId);

      log = (await deps.events.readAll()).filter(isValidEvent);

      // O relógio é recuperado do próprio log: um estado persistido a menos para dessincronizar.
      const latest = log.reduce<string | null>(
        (max, event) => (max === null || event.hlc > max ? event.hlc : max),
        null,
      );
      clock = createHlcClock(deviceId, latest);

      state.value = fold(log);
      status.value = "ready";
    } catch (cause) {
      status.value = "error";
      error.value = describeError(cause);
    }
  }

  function envelope(entityId: Ulid): {
    eventId: Ulid;
    entityId: Ulid;
    deviceId: Ulid;
    hlc: string;
  } {
    if (clock === null || deviceId === null) throw new Error("Store não inicializada");
    const millis = deps.now();
    return { eventId: nextUlid(millis), entityId, deviceId, hlc: clock.tick(millis) };
  }

  /** Persiste antes de exibir: se o append rejeitar, a projeção não muda. */
  async function commit(event: DomainEvent): Promise<void> {
    try {
      await deps.events.append(event);
    } catch (cause) {
      error.value = describeError(cause);
      return;
    }

    error.value = null;
    log = [...log, event];

    const current = state.value;
    const outOfOrder = current.lastHlc !== null && event.hlc <= current.lastHlc;
    state.value = outOfOrder ? fold(log) : apply(current, event);
  }

  return {
    state,
    status,
    error,
    init,

    async add(draft: TransactionDraft): Promise<void> {
      await commit(transactionCreated({ ...envelope(nextUlid(deps.now())), draft }));
    },

    async edit(entityId: Ulid, patch: TransactionPatch): Promise<void> {
      await commit(transactionUpdated({ ...envelope(entityId), patch }));
    },

    async remove(entityId: Ulid): Promise<void> {
      await commit(transactionDeleted(envelope(entityId)));
    },
  };
}
