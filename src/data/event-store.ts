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
  /**
   * Escrita atômica sobre as duas tabelas.
   *
   * Chamar `append` N vezes **não** é equivalente: cada chamada abre sua própria
   * transação, e falha na terceira deixa as duas primeiras gravadas para sempre —
   * o log é append-only e não há como desfazê-las. O wizard de primeiro uso depende
   * disto: um lote interrompido deixaria dois dos quatro métodos padrão existindo e
   * o `localUserId` gravado, e o usuário cairia num app meio semeado sem nenhuma
   * forma de completar o seed.
   *
   * `meta` entra na **mesma** transação pelo mesmo motivo: gravá-lo depois do
   * `bulkPut` reabre exatamente a janela que esta função existe para fechar.
   */
  appendBatch: (events: DomainEvent[], meta: Record<string, string>) => Promise<void>;
  readAll: () => Promise<DomainEvent[]>;
  getMeta: (key: string) => Promise<string | null>;
  setMeta: (key: string, value: string) => Promise<void>;
}

export function createEventStore(db: HomeFinanceDb): EventStore {
  return {
    async append(event: DomainEvent): Promise<void> {
      await db.events.put(event);
    },

    async appendBatch(events: DomainEvent[], meta: Record<string, string>): Promise<void> {
      await db.transaction("rw", db.events, db.meta, async () => {
        // `bulkPut` mantém a idempotência por `id` que o `append` já garante —
        // mesmo evento duas vezes não duplica, que é o que o handshake de sync
        // faz ao reenviar o que o par já tem.
        if (events.length > 0) await db.events.bulkPut(events);
        for (const [key, value] of Object.entries(meta)) {
          await db.meta.put({ key, value });
        }
      });
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
