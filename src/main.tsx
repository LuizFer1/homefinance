import { render } from "preact";
import { App } from "./app";
import { HomeFinanceDb } from "./data/db";
import { createEventStore } from "./data/event-store";
import { cryptoRandomChunk } from "./domain/ids/ulid";
import { createTransactionsStore } from "./features/transactions/store";

/** Data local em 'YYYY-MM-DD'. `toISOString` daria UTC e erraria o dia à noite. */
function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const root = document.getElementById("app");
if (!root) {
  throw new Error("Elemento #app nao encontrado em index.html");
}

const store = createTransactionsStore({
  events: createEventStore(new HomeFinanceDb()),
  now: () => Date.now(),
  randomChunk: cryptoRandomChunk,
});

render(<App store={store} today={todayISO()} />, root);
