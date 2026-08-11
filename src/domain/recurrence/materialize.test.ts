import { describe, expect, it } from "vitest";
import { recurrenceCreated } from "../events/recurrence";
import { stableEntityId } from "../ids/stable-id";
import { EMPTY_STATE, fold } from "../projections/apply";
import { planMaterializations } from "./materialize";
import { occurrenceKey } from "./schedule";

const DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";
const SERIES = "01J9F3K2M7QX8YB4TVWZ0DCEHS";

function seriesEvent(
  overrides: Partial<{
    frequency: "monthly" | "bimonthly";
    scheduleType: "dayOfMonth" | "nthBusinessDay";
    scheduleN: number;
    startOn: string;
    endOn: string | null;
    active: boolean;
  }> = {},
) {
  return recurrenceCreated({
    eventId: "01J9F3K2M7QX8YB4TVWZ0DCEE1",
    entityId: SERIES,
    deviceId: DEVICE,
    hlc: `1754697500000-0000-${DEVICE}`,
    draft: {
      kind: "income",
      description: "Salário",
      amountMinor: 500_000,
      currency: "BRL",
      categoryId: null,
      paymentMethodId: null,
      cashbackMinor: null,
      frequency: overrides.frequency ?? "monthly",
      scheduleType: overrides.scheduleType ?? "nthBusinessDay",
      scheduleN: overrides.scheduleN ?? 5,
      startOn: overrides.startOn ?? "2026-06-01",
      endOn: overrides.endOn ?? null,
      active: overrides.active ?? true,
    },
  });
}

describe("planMaterializations", () => {
  it("gera competencias vencidas ate hoje no 5o dia util", () => {
    // 2026-08-11: 5o util de ago = 07, de jul = 07, de jun = 05 — todos <= 11.
    const state = fold([seriesEvent()]);
    const plans = planMaterializations(state, "2026-08-11");

    expect(plans.map((p) => p.draft.occurredOn)).toEqual([
      "2026-06-05",
      "2026-07-07",
      "2026-08-07",
    ]);
    expect(plans[0]?.entityId).toBe(stableEntityId(occurrenceKey(SERIES, "2026-06")));
    expect(plans[0]?.draft.recurrenceId).toBe(SERIES);
  });

  it("nao gera competencia futura nem serie pausada", () => {
    // 2026-08-04: 5o util de ago e 07, ainda nao chegou.
    const state = fold([seriesEvent({ active: true })]);
    const plans = planMaterializations(state, "2026-08-04");
    expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-06-05", "2026-07-07"]);

    const pausada = fold([seriesEvent({ active: false })]);
    expect(planMaterializations(pausada, "2026-08-11")).toEqual([]);
  });

  it("pula o que ja esta materializado", () => {
    const state = fold([seriesEvent()]);
    const first = planMaterializations(state, "2026-08-11")[0];
    if (first === undefined) throw new Error("esperado plano");

    // Simula ocorrencia ja no estado.
    const withOne = {
      ...state,
      transactions: {
        [first.entityId]: {
          id: first.entityId,
          ...first.draft,
          userId: null,
          deleted: false,
          materialized: true,
          fieldHlc: {},
        },
      },
    };

    const rest = planMaterializations(withOne, "2026-08-11");
    expect(rest).toHaveLength(2);
    expect(rest.some((p) => p.entityId === first.entityId)).toBe(false);
  });

  it("estado vazio nao planeja nada", () => {
    expect(planMaterializations(EMPTY_STATE, "2026-08-11")).toEqual([]);
  });
});
