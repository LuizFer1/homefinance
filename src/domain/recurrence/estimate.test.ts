import { describe, expect, it } from "vitest";
import { stableEntityId } from "../ids/stable-id";
import type { Recurrence } from "../model/recurrence";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import { ESTIMATE_WINDOW, estimateFor } from "./estimate";
import { occurrenceKey } from "./schedule";

const LUZ: Recurrence = {
  ...ALIVE,
  id: "SERIE-LUZ",
  kind: "expense",
  description: "Conta de luz",
  amountMinor: 20_000,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  frequency: "monthly",
  scheduleType: "dayOfMonth",
  scheduleN: 10,
  startOn: "2026-01-10",
  endOn: null,
  active: true,
  variable: true,
};

function occurrence(
  period: string,
  amountMinor: number,
  extra: Partial<Transaction> = {},
  series: Recurrence = LUZ,
): Transaction {
  const key = occurrenceKey(series.id, period);
  return {
    ...ALIVE,
    id: stableEntityId(key),
    kind: series.kind,
    description: series.description,
    amountMinor,
    currency: "BRL",
    categoryId: null,
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: `${period}-10`,
    userId: null,
    recurrenceId: series.id,
    occurrenceKey: key,
    ...extra,
  };
}

describe("estimateFor", () => {
  it("sem nenhuma confirmada, usa o palpite da série", () => {
    expect(estimateFor(LUZ, [], "2026-03")).toBe(20_000);
  });

  it("é a média das confirmadas anteriores, arredondada para centavo", () => {
    const rows = [occurrence("2026-01", 10_000), occurrence("2026-02", 10_001)];

    expect(estimateFor(LUZ, rows, "2026-03")).toBe(10_001);
  });

  it(`usa só as ${ESTIMATE_WINDOW} competências mais recentes`, () => {
    const rows = [
      occurrence("2026-01", 90_000),
      occurrence("2026-02", 90_000),
      ...["03", "04", "05", "06", "07", "08"].map((m) => occurrence(`2026-${m}`, 30_000)),
    ];

    expect(estimateFor(LUZ, rows, "2026-09")).toBe(30_000);
  });

  it("ignora estimadas, apagadas, de outra série e competências a partir da pedida", () => {
    const outra: Recurrence = { ...LUZ, id: "SERIE-AGUA" };
    const rows = [
      occurrence("2026-01", 10_000),
      occurrence("2026-02", 99_000, { estimated: true }),
      occurrence("2026-03", 99_000, { deletedAt: DELETED_AT }),
      occurrence("2026-02", 99_000, {}, outra),
      occurrence("2026-04", 99_000),
      occurrence("2026-05", 99_000),
    ];

    expect(estimateFor(LUZ, rows, "2026-04")).toBe(10_000);
  });

  it("conta como confirmada a ocorrência sem a coluna (lançada quando a série era fixa)", () => {
    const antiga = occurrence("2026-01", 15_000);
    delete antiga.estimated;

    expect(
      estimateFor(LUZ, [antiga, occurrence("2026-02", 25_000, { estimated: false })], "2026-03"),
    ).toBe(20_000);
  });

  it("série bimestral conta ocorrências, não meses", () => {
    const bi: Recurrence = { ...LUZ, frequency: "bimonthly" };
    const rows = ["01", "03", "05", "07", "09", "11"].map((m) =>
      occurrence(`2026-${m}`, 6_000, {}, bi),
    );
    rows.push(occurrence("2025-11", 60_000, {}, bi));

    expect(estimateFor(bi, rows, "2027-01")).toBe(6_000);
  });
});
