import type { DomainEvent } from "../domain/events/types";
import type { EventStore } from "./event-store";

/**
 * `EventStore` em memória, para testes de store.
 *
 * Mora fora dos arquivos `.test.ts` porque três suítes precisam dele — as duas
 * stores de domínio e a de primeiro uso —, e a terceira cópia seria a que
 * esqueceria de reproduzir a atomicidade do `appendBatch`. O sufixo `.fake`
 * mantém o arquivo fora do `include` do Vitest sem escondê-lo do TypeScript.
 */
export interface FakeEventStore extends EventStore {
  events: DomainEvent[];
  /** Faz a próxima escrita rejeitar, para exercitar o caminho de erro. */
  failNext: boolean;
}

export function fakeEventStore(seed: DomainEvent[] = []): FakeEventStore {
  const meta = new Map<string, string>();

  const state: FakeEventStore = {
    events: [...seed],
    failNext: false,

    append: async (event) => {
      if (state.failNext) throw new Error("quota exceeded");
      state.events = [...state.events.filter((item) => item.id !== event.id), event];
    },

    appendBatch: async (events, entries) => {
      if (state.failNext) throw new Error("quota exceeded");

      // Tudo ou nada, como a transação Dexie: montar o próximo estado inteiro
      // antes de publicá-lo é o que impede este duplo de passar num teste que a
      // implementação real reprovaria.
      const next = [...state.events];
      for (const event of events) {
        const at = next.findIndex((item) => item.id === event.id);
        if (at === -1) next.push(event);
        else next[at] = event;
      }

      state.events = next;
      for (const [key, value] of Object.entries(entries)) meta.set(key, value);
    },

    readAll: async () => [...state.events].sort((a, b) => (a.hlc < b.hlc ? -1 : 1)),

    getMeta: async (key) => meta.get(key) ?? null,

    setMeta: async (key, value) => {
      meta.set(key, value);
    },
  };

  return state;
}
