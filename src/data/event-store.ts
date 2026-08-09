import type { DomainEvent } from "../domain/events/types";
import type { HomeFinanceDb } from "./db";

export interface EventStore {
  /**
   * Idempotente por `id`: o mesmo evento duas vezes não duplica nem lança — é
   * exatamente o que o handshake de sync faz ao reenviar o que o par já tem.
   *
   * A segurança disso depende inteiramente de o `id` ser único, garantia que vive
   * fora desta camada (`domain/ids/ulid.ts`, 80 bits de `crypto.getRandomValues`).
   * Dois eventos **diferentes** com o mesmo `id` fariam o segundo sobrescrever o
   * primeiro em silêncio. Não confundir com colisão de `hlc`, essa sim real quando
   * dois aparelhos restauram o mesmo backup: `hlc` igual com `id` diferente grava
   * dois registros distintos, como deve.
   */
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
