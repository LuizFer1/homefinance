import { describe, expect, it } from "vitest";
import { stableEntityId } from "../ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { occurrenceKey } from "./schedule";
import { nextOccurrences, upcomingRecurrences } from "./upcoming";

const SERIES = "01J9F3K2M7QX8YB4TVWZ0DCEHS";

function series(overrides: Partial<Recurrence>): Recurrence {
  return {
    id: SERIES,
    ...ALIVE,
    kind: "expense",
    description: "Internet",
    amountMinor: 12_000,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    frequency: "monthly",
    scheduleType: "dayOfMonth",
    scheduleN: 30,
    startOn: "2026-06-30",
    endOn: null,
    active: true,
    ...overrides,
  };
}

function stateWith(recurrences: Recurrence[], transactions: Transaction[] = []): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: Object.fromEntries(recurrences.map((row) => [row.id, row])),
    transactions: Object.fromEntries(transactions.map((row) => [row.id, row])),
  };
}

describe("upcomingRecurrences", () => {
  it("lista as ocorrências dos próximos dias, depois de hoje", () => {
    const state = stateWith([series({})]);

    const upcoming = upcomingRecurrences(state, "2026-09-24", 30);

    expect(upcoming.map((item) => item.date)).toEqual(["2026-09-30"]);
    expect(upcoming[0]).toMatchObject({ description: "Internet", amountMinor: 12_000 });
  });

  it("janela maior pega a competência seguinte", () => {
    const state = stateWith([series({})]);

    expect(upcomingRecurrences(state, "2026-09-24", 40).map((item) => item.date)).toEqual([
      "2026-09-30",
      "2026-10-30",
    ]);
  });

  it("não repete ocorrência já materializada", () => {
    const key = occurrenceKey(SERIES, "2026-09");
    const state = stateWith(
      [series({})],
      [
        {
          id: stableEntityId(key),
          ...ALIVE,
          kind: "expense",
          description: "Internet",
          amountMinor: 12_000,
          currency: "BRL",
          categoryId: null,
          paymentMethodId: null,
          cashbackMinor: null,
          occurredOn: "2026-09-30",
          userId: null,
          recurrenceId: SERIES,
          occurrenceKey: key,
        },
      ],
    );

    expect(upcomingRecurrences(state, "2026-09-24", 30)).toEqual([]);
  });

  it("respeita pausa e data final", () => {
    expect(upcomingRecurrences(stateWith([series({ active: false })]), "2026-09-24", 30)).toEqual(
      [],
    );
    expect(
      upcomingRecurrences(stateWith([series({ endOn: "2026-09-29" })]), "2026-09-24", 30),
    ).toEqual([]);
  });

  it("ignora série apagada", () => {
    const state = stateWith([series({ deletedAt: DELETED_AT })]);

    expect(upcomingRecurrences(state, "2026-09-24", 30)).toEqual([]);
  });
});

describe("nextOccurrences", () => {
  it("dá as próximas depois da primeira, no passo da frequência", () => {
    expect(
      nextOccurrences(
        { startOn: "2026-09-24", frequency: "monthly", scheduleType: "dayOfMonth", scheduleN: 24 },
        4,
      ),
    ).toEqual(["2026-10-24", "2026-11-24", "2026-12-24", "2027-01-24"]);
  });

  it("usa o último dia quando o mês é curto", () => {
    expect(
      nextOccurrences(
        { startOn: "2026-01-31", frequency: "monthly", scheduleType: "dayOfMonth", scheduleN: 31 },
        1,
      ),
    ).toEqual(["2026-02-28"]);
  });

  it("para na data final", () => {
    expect(
      nextOccurrences(
        {
          startOn: "2026-09-24",
          frequency: "quarterly",
          scheduleType: "dayOfMonth",
          scheduleN: 24,
          endOn: "2027-01-01",
        },
        4,
      ),
    ).toEqual(["2026-12-24"]);
  });
});
