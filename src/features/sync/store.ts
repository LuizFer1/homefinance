import { batch, type ReadonlySignal, type Signal, signal } from "@preact/signals";
import type { HomeFinanceDb } from "../../data/db";
import { clearHubLink, type HubLink, readHubLink } from "../../data/hub-link";
import type { SyncSummary } from "../../sync/engine";
import type { PairInput } from "../../sync/pairing";
import type { HubTransport } from "../../sync/transport";
import { ignoreHandled, type Session } from "../session/session";
import type { HubDeepLink } from "./deep-link";
import { describeFailure, type SyncFailure, type SyncStatus } from "./status";

/** Só o tipo: o valor chega pelo `import()` de `load`. */
type SyncModule = typeof import("../../sync/sync-hub");

/**
 * Entre duas rodadas automáticas (boot e volta ao primeiro plano). Curto o
 * bastante para "abri o app e já tem o lançamento da outra pessoa"; longo o
 * bastante para dez voltas ao app numa tarde não virarem dez rodadas.
 */
export const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * O `import()` do chunk falhou. Offline, ele nunca foi baixado (o primeiro
 * pareamento precisa de internet uma vez). Online, a aba roda uma versão que o
 * deploy já apagou — como `PdfReaderUnavailableError`.
 */
export class SyncModuleUnavailableError extends Error {
  readonly offline: boolean;

  constructor(offline: boolean, cause: unknown) {
    super(
      offline
        ? "Módulo de sincronização não baixado"
        : "Módulo de sincronização da versão anterior",
      {
        cause,
      },
    );
    this.name = "SyncModuleUnavailableError";
    this.offline = offline;
  }
}

export interface SyncStoreDeps {
  db: HomeFinanceDb;
  session: Session;
  fetch: typeof fetch;
  now: () => number;
  /** Injetado no teste; em produção é o `import()` que separa o chunk do shell. */
  load?: () => Promise<SyncModule>;
  isOnline: () => boolean;
  /** Chamado quando a versão aberta se mostrou velha — hora de buscar a nova. */
  onStale: () => void;
  /** Depois de uma rodada que trouxe linhas (materialização de séries recebidas). */
  afterPull?: () => Promise<void>;
}

export interface SyncStore {
  /** Null = não pareado. */
  link: ReadonlySignal<HubLink | null>;
  status: ReadonlySignal<SyncStatus>;
  /** O hub respondeu 401: pareado, mas com a chave morta. */
  revoked: ReadonlySignal<boolean>;
  lastSyncAt: ReadonlySignal<string | null>;
  lastError: ReadonlySignal<SyncFailure | null>;
  lastSummary: ReadonlySignal<SyncSummary | null>;
  /** Deep link do QR lido no boot, à espera da sessão e do primeiro uso. */
  pendingDeepLink: Signal<HubDeepLink | null>;
  /** Lê a ligação do disco. Depois de `session.init`. */
  init: () => Promise<void>;
  /** Pareia e faz a primeira rodada. Rejeita com a causa; `lastError` tem a mensagem. */
  pair: (input: PairInput) => Promise<void>;
  /**
   * Uma rodada. `auto` respeita o intervalo e nunca rejeita (a falha fica em
   * `lastError`); o manual ignora o intervalo e rejeita. Null = não rodou.
   */
  sync: (options?: { auto?: boolean }) => Promise<SyncSummary | null>;
  unpair: () => Promise<void>;
}

export function createSyncStore(deps: SyncStoreDeps): SyncStore {
  const load = deps.load ?? (() => import("../../sync/sync-hub"));
  const link = signal<HubLink | null>(null);
  const status = signal<SyncStatus>("idle");
  const revoked = signal(false);
  const lastSyncAt = signal<string | null>(null);
  const lastError = signal<SyncFailure | null>(null);
  const lastSummary = signal<SyncSummary | null>(null);
  const pendingDeepLink = signal<HubDeepLink | null>(null);

  let loaded: Promise<{ mod: SyncModule; transport: HubTransport }> | null = null;
  let inFlight: Promise<SyncSummary | null> | null = null;
  let lastAttempt = Number.NEGATIVE_INFINITY;

  function loadModule() {
    if (loaded === null) {
      loaded = load()
        .then((mod) => ({ mod, transport: mod.createHubTransport({ fetch: deps.fetch }) }))
        .catch((cause: unknown) => {
          // Próxima tentativa carrega de novo: a rede pode ter voltado.
          loaded = null;
          const offline = !deps.isOnline();
          if (!offline) deps.onStale();
          throw new SyncModuleUnavailableError(offline, cause);
        });
    }
    return loaded;
  }

  async function init(): Promise<void> {
    const found = await readHubLink(deps.db);
    batch(() => {
      link.value = found;
      revoked.value = found?.revoked ?? false;
      lastSyncAt.value = found?.lastSyncAt ?? null;
    });
  }

  async function run(auto: boolean): Promise<SyncSummary | null> {
    status.value = "syncing";
    let summary: SyncSummary | null = null;
    try {
      const { mod, transport } = await loadModule();
      const clock = deps.session.clock();
      summary = await mod.runSync({
        db: deps.db,
        transport,
        deviceId: clock.deviceId,
        observe: clock.observe,
        now: deps.now,
      });
      batch(() => {
        lastSummary.value = summary;
        lastError.value = null;
      });
      return summary;
    } catch (cause) {
      lastError.value = describeFailure(cause);
      if (auto) return null;
      throw cause;
    } finally {
      // Sempre, inclusive em falha: as páginas já gravadas precisam aparecer, e
      // `revoked`/`lastSyncAt` são o que o disco diz, não o que a store achava.
      await deps.session.reload().catch(ignoreHandled);
      await init().catch(ignoreHandled);
      if (summary !== null && summary.pulled > 0 && deps.afterPull !== undefined) {
        await deps.afterPull().catch(ignoreHandled);
      }
      status.value = "idle";
    }
  }

  function sync({ auto = false }: { auto?: boolean } = {}): Promise<SyncSummary | null> {
    if (link.value === null || revoked.value) return Promise.resolve(null);
    if (inFlight !== null) return inFlight;
    if (auto && deps.now() - lastAttempt < AUTO_SYNC_INTERVAL_MS) return Promise.resolve(null);
    lastAttempt = deps.now();
    inFlight = run(auto).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  /**
   * Antes de trocar ou apagar a ligação, a rodada em voo termina: ela ainda
   * limparia `dirty` e gravaria o `syncCursor` (ou "revogado") do hub antigo
   * por cima do pareamento novo. A falha dela não importa aqui.
   */
  async function settle(): Promise<void> {
    await inFlight?.catch(() => {});
  }

  async function pair(input: PairInput): Promise<void> {
    await settle();
    status.value = "pairing";
    try {
      const { mod, transport } = await loadModule();
      await mod.pairWithHub(
        {
          db: deps.db,
          transport,
          deviceId: deps.session.clock().deviceId,
          userId: deps.session.localUserId.value,
        },
        input,
      );
      batch(() => {
        lastError.value = null;
        lastSummary.value = null;
      });
      await init();
    } catch (cause) {
      lastError.value = describeFailure(cause);
      throw cause;
    } finally {
      status.value = "idle";
    }
    // Primeira rodada na hora. Falha dela não desfaz o pareamento: fica em `lastError`.
    await sync().catch(ignoreHandled);
  }

  async function unpair(): Promise<void> {
    // Desconectar não precisa do chunk nem de rede: é só apagar chaves locais.
    await settle();
    await clearHubLink(deps.db);
    batch(() => {
      link.value = null;
      revoked.value = false;
      lastError.value = null;
      lastSummary.value = null;
      lastSyncAt.value = null;
    });
  }

  return {
    link,
    status,
    revoked,
    lastSyncAt,
    lastError,
    lastSummary,
    pendingDeepLink,
    init,
    pair,
    sync,
    unpair,
  };
}
