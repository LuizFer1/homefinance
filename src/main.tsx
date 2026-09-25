import "./styles/app.css";
import { render } from "preact";
import { App } from "./app";
import { HomeFinanceDb } from "./data/db";
import { cryptoRandomChunk } from "./domain/ids/ulid";
import { createReadPdf } from "./features/import/read-pdf";
import { createImportStore } from "./features/import/store";
import { createOnboardingStore } from "./features/onboarding/store";
import { processAvatar } from "./features/profile/avatar";
import { browserAvatarDeps } from "./features/profile/avatar-canvas";
import { createProfileStore } from "./features/profile/store";
import { createRecurrenceStore } from "./features/recurrence/store";
import { createRegistryStore } from "./features/registry/store";
import { createSession } from "./features/session/session";
import { type ResetDeps, resetDevice } from "./features/settings/reset";
import type { ThemeStorage } from "./features/theme/theme";
import { createTransactionsStore } from "./features/transactions/store";
import { createUpdateStore, type SwContainer } from "./features/update/store";

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

// Uma sessão por aparelho: relógio HLC, estado em memória e porta de escrita
// moram nela, e todas as stores de domínio a compartilham. Um relógio por store
// entrelaçaria os HLCs, e um estado por store divergiria.
const session = createSession({
  db,
  now: () => Date.now(),
  randomChunk: cryptoRandomChunk,
});

const store = createTransactionsStore(session);
const registry = createRegistryStore(session);
const profileStore = createProfileStore(session);
const recurrence = createRecurrenceStore(session);
const onboarding = createOnboardingStore(session);
const importer = createImportStore(session, recurrence);

// Só referenciar `navigator.serviceWorker` já lança em contexto sandbox.
function serviceWorkerContainer(): SwContainer | undefined {
  try {
    return "serviceWorker" in navigator
      ? (navigator.serviceWorker as unknown as SwContainer)
      : undefined;
  } catch {
    return undefined;
  }
}

const update = createUpdateStore({
  serviceWorker: serviceWorkerContainer(),
  reload: () => {
    window.location.reload();
  },
  now: () => Date.now(),
});

// PWA instalado fica dias aberto sem navegar, e é na navegação que o navegador
// procura `sw.js` novo. Voltar para o app é o momento natural de perguntar.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void update.check();
});

const readPdf = createReadPdf({
  isOnline: () => navigator.onLine,
  onStale: () => void update.check(true),
});

render(
  <App
    session={session}
    store={store}
    registry={registry}
    profileStore={profileStore}
    recurrence={recurrence}
    onboarding={onboarding}
    importer={importer}
    update={update}
    readPdf={readPdf}
    processFile={(file) => processAvatar(file, browserAvatarDeps)}
    onReset={() =>
      resetDevice({
        db,
        // Só referenciar as APIs já lança em contexto sandbox — por isso o
        // typeof e o optional chaining, não um assert de presença.
        caches: typeof caches === "undefined" ? undefined : caches,
        serviceWorker:
          typeof navigator === "undefined" || !("serviceWorker" in navigator)
            ? undefined
            : (navigator.serviceWorker as ResetDeps["serviceWorker"]),
        reload: () => {
          window.location.reload();
        },
      })
    }
    today={todayISO()}
    hour={new Date().getHours()}
    theme={{ storage: safeStorage(), doc: document }}
  />,
  root,
);
