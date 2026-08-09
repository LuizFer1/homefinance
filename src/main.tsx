import "./styles/app.css";
import { render } from "preact";
import { App } from "./app";
import { HomeFinanceDb } from "./data/db";
import { createEventStore } from "./data/event-store";
import { cryptoRandomChunk } from "./domain/ids/ulid";
import { createRegistryStore } from "./features/registry/store";
import { createSession } from "./features/session/session";
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

// Uma sessão por aparelho: relógio HLC, projeção e porta de escrita moram nela,
// e todas as stores de domínio a compartilham. Um relógio por store entrelaçaria
// os HLCs e forçaria refold do log inteiro a cada escrita.
const session = createSession({
  events: createEventStore(new HomeFinanceDb()),
  now: () => Date.now(),
  randomChunk: cryptoRandomChunk,
});

const store = createTransactionsStore(session);
const registry = createRegistryStore(session);

render(
  <App
    store={store}
    registry={registry}
    today={todayISO()}
    theme={{ storage: safeStorage(), doc: document }}
  />,
  root,
);
