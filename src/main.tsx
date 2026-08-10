import "./styles/app.css";
import { render } from "preact";
import { App } from "./app";
import { HomeFinanceDb } from "./data/db";
import { createEventStore } from "./data/event-store";
import { cryptoRandomChunk } from "./domain/ids/ulid";
import { createOnboardingStore } from "./features/onboarding/store";
import { processAvatar } from "./features/profile/avatar";
import { browserAvatarDeps } from "./features/profile/avatar-canvas";
import { createRegistryStore } from "./features/registry/store";
import { createSession } from "./features/session/session";
import { type ResetDeps, resetDevice } from "./features/settings/reset";
import type { ThemeStorage } from "./features/theme/theme";
import { createTransactionsStore } from "./features/transactions/store";

/** Data local em 'YYYY-MM-DD'. `toISOString` daria UTC e erraria o dia à noite. */
function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Só referenciar `localStorage` já lança em contexto sandbox — antes de
 * qualquer leitura. Sem isto o app inteiro morre por causa da preferência de
 * tema, que é a coisa menos importante da tela.
 */
function safeStorage(): ThemeStorage {
  try {
    const ls = window.localStorage;
    return {
      getItem: (key) => ls.getItem(key),
      setItem: (key, value) => {
        ls.setItem(key, value);
      },
    };
  } catch {
    const memoria = new Map<string, string>();
    return {
      getItem: (key) => memoria.get(key) ?? null,
      setItem: (key, value) => {
        memoria.set(key, value);
      },
    };
  }
}

const root = document.getElementById("app");
if (!root) {
  throw new Error("Elemento #app nao encontrado em index.html");
}

// O banco sai da expressão para o reset poder apagá-lo. Uma segunda instância
// apontando para o mesmo nome apagaria o banco certo, mas deixaria esta aberta e
// o `delete` ficaria bloqueado até o usuário fechar a aba.
const db = new HomeFinanceDb();

// Uma sessão por aparelho: relógio HLC, projeção e porta de escrita moram nela,
// e todas as stores de domínio a compartilham. Um relógio por store entrelaçaria
// os HLCs e forçaria refold do log inteiro a cada escrita.
const session = createSession({
  events: createEventStore(db),
  now: () => Date.now(),
  randomChunk: cryptoRandomChunk,
});

const store = createTransactionsStore(session);
const registry = createRegistryStore(session);
const onboarding = createOnboardingStore(session);

render(
  <App
    store={store}
    registry={registry}
    onboarding={onboarding}
    localUserId={session.localUserId}
    processFile={(file) => processAvatar(file, browserAvatarDeps)}
    onReset={() => {
      void resetDevice({
        db,
        // Só referenciar as duas APIs já lança em contexto sandbox, e nenhuma
        // das duas existe hoje: Workbox não está instalado.
        caches: typeof caches === "undefined" ? undefined : caches,
        serviceWorker: navigator.serviceWorker as ResetDeps["serviceWorker"],
        reload: () => {
          window.location.reload();
        },
      });
    }}
    today={todayISO()}
    hour={new Date().getHours()}
    theme={{ storage: safeStorage(), doc: document }}
  />,
  root,
);
