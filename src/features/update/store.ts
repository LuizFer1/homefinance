import { type ReadonlySignal, signal } from "@preact/signals";

/** O pedaço de `ServiceWorker` que a store usa. */
export interface SwWorker {
  readonly state: string;
  postMessage: (message: unknown) => void;
  addEventListener: (type: "statechange", listener: () => void) => void;
}

/** O pedaço de `ServiceWorkerRegistration` que a store usa. */
export interface SwRegistration {
  readonly waiting: SwWorker | null;
  readonly installing: SwWorker | null;
  update: () => Promise<unknown>;
  addEventListener: (type: "updatefound", listener: () => void) => void;
}

/** O pedaço de `navigator.serviceWorker` que a store usa. */
export interface SwContainer {
  readonly controller: unknown;
  readonly ready: Promise<SwRegistration>;
  addEventListener: (type: "controllerchange", listener: () => void) => void;
}

export interface UpdateDeps {
  /** Ausente onde o navegador não tem service worker (ou em contexto sandbox). */
  serviceWorker?: SwContainer;
  /** Injetado: no teste, recarregar derrubaria o runner. */
  reload: () => void;
  now: () => number;
}

export interface UpdateStore {
  /** Há uma versão nova instalada, esperando só a pessoa aceitar. */
  ready: ReadonlySignal<boolean>;
  /**
   * Pergunta ao servidor se há `sw.js` novo. Com `force`, ignora o intervalo —
   * para quando a versão aberta acabou de se mostrar velha.
   */
  check: (force?: boolean) => Promise<void>;
  /** Troca para a versão nova e recarrega. */
  apply: () => void;
}

/**
 * Entre duas buscas por versão nova. O navegador já procura a cada navegação;
 * isto cobre o app que fica aberto dias sem navegar, sem baixar o `sw.js` a
 * cada troca de aba.
 */
export const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Aviso de versão nova sem `workbox-window`: o SW é gerado com
 * `registerType: "prompt"`, então a versão nova instala e **espera**. Trocar
 * sozinha, com a pessoa no meio de um formulário, recarregaria a tela por
 * baixo dela; esperar sem avisar deixaria o app velho aberto por dias.
 *
 * O registro continua no `registerSW.js` do build — aqui só se observa.
 */
export function createUpdateStore(deps: UpdateDeps): UpdateStore {
  const ready = signal(false);
  const container = deps.serviceWorker;
  let registration: SwRegistration | null = null;
  let lastCheck = Number.NEGATIVE_INFINITY;

  function watch(worker: SwWorker) {
    worker.addEventListener("statechange", () => {
      // Sem controller, este é o primeiro SW da página: nada a atualizar.
      if (worker.state === "installed" && container?.controller) ready.value = true;
    });
  }

  if (container !== undefined) {
    // `ready` só resolve quando há SW ativo — antes disso não existe versão
    // velha, logo nenhuma atualização a oferecer.
    void container.ready
      .then((found) => {
        registration = found;
        if (found.waiting !== null && container.controller) ready.value = true;
        found.addEventListener("updatefound", () => {
          if (found.installing !== null) watch(found.installing);
        });
      })
      .catch(() => {
        // Sem registro, sem aviso: o app segue na versão que já tem.
      });
  }

  return {
    ready,
    async check(force = false) {
      if (registration === null) return;
      const now = deps.now();
      if (!force && now - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = now;
      try {
        await registration.update();
      } catch {
        // Offline é o estado normal deste app, não um erro.
      }
    },
    apply() {
      const waiting = registration?.waiting ?? null;
      if (waiting === null || container === undefined) {
        deps.reload();
        return;
      }
      // Recarregar antes da troca abriria a versão velha de novo, do cache
      // velho. O `controllerchange` é o sinal de que o SW novo assumiu.
      let reloaded = false;
      container.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        deps.reload();
      });
      // Mensagem que o SW gerado pelo Workbox escuta no modo `prompt`.
      waiting.postMessage({ type: "SKIP_WAITING" });
    },
  };
}
