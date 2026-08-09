import type { DomainEvent } from "../domain/events/types";
import type { HomeFinanceDb } from "./db";

export interface EventStore {
  /** Idempotente por `id`: o mesmo evento duas vezes não duplica nem lança. */
  append: (event: DomainEvent) => Promise<void>;
  readAll: () => Promise<DomainEvent[]>;
  getMeta: (key: string) => Promise<string | null>;
  setMeta: (key: string, value: string) => Promise<void>;
}

export function createEventStore(db: HomeFinanceDb): EventStore {
  return {
    async append(event: DomainEvent): Promise<void> {
      await db.events.put(event);
    },

    async readAll(): Promise<DomainEvent[]> {
      return await db.events.orderBy("hlc").toArray();
    },

    async getMeta(key: string): Promise<string | null> {
      const row = await db.meta.get(key);
      return row?.value ?? null;
    },

    async setMeta(key: string, value: string): Promise<void> {
      await db.meta.put({ key, value });
    },
  };
}
