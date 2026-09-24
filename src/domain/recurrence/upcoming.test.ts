import { describe, expect, it } from "vitest";
import { recurrenceCreated } from "../events/recurrence";
import { transactionCreated } from "../events/transaction";
import { stableEntityId } from "../ids/stable-id";
import { fold } from "../projections/apply";
import { occurrenceKey } from "./schedule";
import { nextOccurrences, upcomingRecurrences } from "./upcoming";

const DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";
const SERIES = "01J9F3K2M7QX8YB4TVWZ0DCEHS";

function series(overrides: Partial<{ startOn: string; endOn: string | null; active: boolean }>) {
  return recurrenceCreated({
    eventId: "01J9F3K2M7QX8YB4TVWZ0DCEE1",
    entityId: SERIES,
    deviceId: DEVICE,
    hlc: `1754697500000-0000-${DEVICE}`,
    draft: {
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
      startOn: overrides.startOn ?? "2026-06-30",
      endOn: overrides.endOn ?? null,
      active: overrides.active ?? true,
    },
  });
}

describe("upcomingRecurrences", () => {
  it("lista as ocorrências dos próximos dias, depois de hoje", () => {
    const state = fold([series({})]);

    const upcoming = upcomingRecurrences(state, "2026-09-24", 30);

    expect(upcoming.map((item) => item.date)).toEqual(["2026-09-30"]);
    expect(upcoming[0]).toMatchObject({ description: "Internet", amountMinor: 12_000 });
  });

  it("janela maior pega a competência seguinte", () => {
    const state = fold([series({})]);

    expect(upcomingRecurrences(state, "2026-09-24", 40).map((item) => item.date)).toEqual([
      "2026-09-30",
      "2026-10-30",
    ]);
  });

  it("não repete ocorrência já materializada", () => {
    const key = occurrenceKey(SERIES, "2026-09");
    const state = fold([
      series({}),
      transactionCreated({
        eventId: "01J9F3K2M7QX8YB4TVWZ0DCEE2",
        entityId: stableEntityId(key),
        deviceId: DEVICE,
        hlc: `1754697500001-0000-${DEVICE}`,
        draft: {
          kind: "expense",
          description: "Internet",
          amountMinor: 12_000,
          currency: "BRL",
          categoryId: null,
          paymentMethodId: null,
          cashbackMinor: null,
          occurredOn: "2026-09-30",
          recurrenceId: SERIES,
          occurrenceKey: key,
        },
        userId: null,
      }),
    ]);

    expect(upcomingRecurrences(state, "2026-09-24", 30)).toEqual([]);
  });

  it("respeita pausa e data final", () => {
    expect(upcomingRecurrences(fold([series({ active: false })]), "2026-09-24", 30)).toEqual([]);
    expect(upcomingRecurrences(fold([series({ endOn: "2026-09-29" })]), "2026-09-24", 30)).toEqual(
      [],
    );
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
