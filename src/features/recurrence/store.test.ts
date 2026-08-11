import { describe, expect, it } from "vitest";
import { type FakeEventStore, fakeEventStore } from "../../data/event-store.fake";
import { listTransactions } from "../../domain/projections/selectors";
import { createSession, type Session } from "../session/session";
import { createRecurrenceStore } from "./store";

function newSession(events: FakeEventStore): Session {
  let millis = 1_754_697_600_000;
  return createSession({
    events,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  });
}

const DRAFT = {
  kind: "income" as const,
  description: "Salário",
  amountMinor: 500_000,
  currency: "BRL" as const,
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-06-05",
  recurrenceId: null,
  occurrenceKey: null,
};

describe("createRecurrenceStore", () => {
  it("cria a serie e materializa as ocorrencias ate hoje", async () => {
    const events = fakeEventStore();
    const session = newSession(events);
    await session.init();
    const store = createRecurrenceStore(session);

    await store.createSeries(
      DRAFT,
      {
        frequency: "monthly",
        scheduleType: "nthBusinessDay",
        scheduleN: 5,
        endOn: null,
      },
      "2026-08-11",
    );

    expect(events.events.some((e) => e.entity === "recurrence" && e.action === "create")).toBe(
      true,
    );
    const txs = listTransactions(session.state.value);
    expect(txs).toHaveLength(3);
    expect(txs.every((t) => t.recurrenceId !== null)).toBe(true);
    expect(txs.map((t) => t.occurredOn).sort()).toEqual(["2026-06-05", "2026-07-07", "2026-08-07"]);
  });

  it("materializeDue e idempotente", async () => {
    const events = fakeEventStore();
    const session = newSession(events);
    await session.init();
    const store = createRecurrenceStore(session);

    await store.createSeries(
      DRAFT,
      {
        frequency: "monthly",
        scheduleType: "dayOfMonth",
        scheduleN: 5,
        endOn: null,
      },
      "2026-08-05",
    );
    const before = events.events.length;
    await store.materializeDue("2026-08-05");
    expect(events.events).toHaveLength(before);
  });
});
