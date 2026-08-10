import { batch, type Signal, signal } from "@preact/signals";
import type { EventStore } from "../../data/event-store";
import { createDeviceClock, type DeviceClock } from "../../domain/clock/device-clock";
import { compareHlc } from "../../domain/clock/hlc";
import type { DomainEvent } from "../../domain/events/types";
import { isValidEvent } from "../../domain/events/validate";
import { createUlidFactory, type RandomChunk, type Ulid } from "../../domain/ids/ulid";
import { apply, EMPTY_STATE, fold, type ProjectionState } from "../../domain/projections/apply";

const DEVICE_ID_KEY = "deviceId";

/**
 * Qual perfil sou **eu**, neste aparelho.
 *
 * Estado de dispositivo, fora do log e nunca sincronizado — mora ao lado do
 * `deviceId` pelo mesmo motivo: responde o que este aparelho é, não o que a base
 * contém. Derivar o primeiro uso de "existe algum `user` no log" quebraria assim
 * que houvesse sync: o perfil da outra pessoa estaria lá, este aparelho pularia
 * o cadastro, e todo lançamento seguinte nasceria sem autor.
 */
export const LOCAL_USER_ID_KEY = "localUserId";

export type SessionStatus = "loading" | "ready" | "error";

export interface SessionDeps {
  events: EventStore;
  now: () => number;
  randomChunk: RandomChunk;
}

/**
 * O que as stores de domínio compartilham num aparelho.
 *
 * Uma projeção por store divergiria — a fatia 3 precisa ler categoria e
 * transação do mesmo estado — e um relógio por store entrelaçaria os HLCs,
 * forçando refold do log inteiro a cada escrita. Ambos moram aqui, criados uma
 * vez no bootstrap, e as stores só trazem os construtores de evento.
 */
export interface Session {
  state: Signal<ProjectionState>;
  status: Signal<SessionStatus>;
  error: Signal<string | null>;
  /** Nulo enquanto o wizard de primeiro uso não concluiu **neste** aparelho. */
  localUserId: Signal<Ulid | null>;
  init: () => Promise<void>;
  /** Persiste antes de exibir: se o append rejeitar, a projeção não muda. */
  commit: (event: DomainEvent) => Promise<void>;
  /**
   * Escrita atômica de vários eventos mais chaves de `meta`. Se a persistência
   * rejeitar, nada muda — nem o disco, nem a projeção, nem `localUserId`.
   */
  commitBatch: (events: DomainEvent[], meta: Record<string, string>) => Promise<void>;
  /** Lança se chamado antes de `init` concluir. */
  clock: () => DeviceClock;
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function createSession(deps: SessionDeps): Session {
  const state = signal<ProjectionState>(EMPTY_STATE);
  const status = signal<SessionStatus>("loading");
  const error = signal<string | null>(null);
  const localUserId = signal<Ulid | null>(null);

  let log: DomainEvent[] = [];
  let device: DeviceClock | null = null;

  async function init(): Promise<void> {
    try {
      const nextUlid = createUlidFactory(deps.randomChunk);
      const stored = await deps.events.getMeta(DEVICE_ID_KEY);
      const deviceId: Ulid = stored ?? nextUlid(deps.now());
      if (stored === null) await deps.events.setMeta(DEVICE_ID_KEY, deviceId);

      const perfilLocal = await deps.events.getMeta(LOCAL_USER_ID_KEY);

      const bruto = await deps.events.readAll();
      log = bruto.filter(isValidEvent);

      const descartados = bruto.length - log.length;
      if (descartados > 0) {
        // Descartar em silêncio faz um evento corrompido sumir do estado do usuário
        // sem deixar rastro. O log append-only é eterno: isso vai acontecer um dia.
        console.warn(`HomeFinance: ${descartados} evento(s) invalido(s) descartado(s) do log.`);
      }

      // O relógio é recuperado do próprio log: um estado persistido a menos para
      // dessincronizar.
      const latest = log.reduce<string | null>(
        (max, event) => (max === null || compareHlc(event.hlc, max) > 0 ? event.hlc : max),
        null,
      );
      device = createDeviceClock({
        deviceId,
        initialHlc: latest,
        now: deps.now,
        randomChunk: deps.randomChunk,
      });

      // Uma atualização só: um render com `status` pronto e `state` ainda vazio
      // faria a tela piscar "Nenhum lançamento ainda" antes dos dados do disco.
      batch(() => {
        state.value = fold(log);
        localUserId.value = perfilLocal;
        status.value = "ready";
      });
    } catch (cause) {
      batch(() => {
        status.value = "error";
        error.value = describeError(cause);
      });
    }
  }

  async function commit(event: DomainEvent): Promise<void> {
    try {
      await deps.events.append(event);
    } catch (cause) {
      error.value = describeError(cause);
      return;
    }

    log = [...log, event];

    const current = state.value;
    const outOfOrder = current.lastHlc !== null && compareHlc(event.hlc, current.lastHlc) <= 0;
    const next = outOfOrder ? fold(log) : apply(current, event);

    batch(() => {
      error.value = null;
      state.value = next;
    });
  }

  async function commitBatch(events: DomainEvent[], meta: Record<string, string>): Promise<void> {
    try {
      await deps.events.appendBatch(events, meta);
    } catch (cause) {
      error.value = describeError(cause);
      return;
    }

    log = [...log, ...events];
    // Refold em vez de `apply` em sequência: o lote é raro — primeiro uso e, na
    // fatia 4, import de backup — e refoldar é sempre correto, enquanto aplicar
    // N eventos aqui exigiria repetir a decisão de ordem que o `fold` já toma.
    const next = fold(log);
    const perfilLocal = meta[LOCAL_USER_ID_KEY];

    batch(() => {
      error.value = null;
      state.value = next;
      if (perfilLocal !== undefined) localUserId.value = perfilLocal;
    });
  }

  return {
    state,
    status,
    error,
    localUserId,
    init,
    commit,
    commitBatch,
    clock: () => {
      if (device === null) throw new Error("Sessão não inicializada");
      return device;
    },
  };
}
