import { describe, expect, it } from "vitest";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { collidingId } from "./collision.fake";
import { stableEntityIdV1, stableEntityIdV2 } from "./stable-id";
import { pickStableId, rowForKey } from "./stable-slot";

const H1 = "1793000000000-0000-01JZ0000000000000000000DV1";
const H2 = "1793000000000-0001-01JZ0000000000000000000DV2";

const row = (id: string, updatedAt: string, deleted = false) => ({
  ...ALIVE,
  id,
  updatedAt,
  deletedAt: deleted ? DELETED_AT : null,
});

describe("collidingId", () => {
  it("acha um id cuja semente colide na v1 com a do outro", () => {
    const seedOf = (id: string) => `budget:${id}`;
    const a = "01JZ0000000000000000000CTA";
    const b = collidingId("01JZ0000000000000000000", a, seedOf);
    expect(b).not.toBe(a);
    expect(stableEntityIdV1(seedOf(b))).toBe(stableEntityIdV1(seedOf(a)));
  });
});

describe("pickStableId", () => {
  it("lugar v1 livre: v1, o mesmo id do app velho", () => {
    expect(pickStableId({}, "S:2027-01")).toBe(stableEntityIdV1("S:2027-01"));
  });

  it("lugar v1 ocupado por qualquer linha, viva ou apagada: v2", () => {
    const slot = stableEntityIdV1("S:2027-01");
    expect(pickStableId({ [slot]: row(slot, H1) }, "S:2027-01")).toBe(
      stableEntityIdV2("S:2027-01"),
    );
    expect(pickStableId({ [slot]: row(slot, H1, true) }, "S:2027-01")).toBe(
      stableEntityIdV2("S:2027-01"),
    );
  });
});

describe("rowForKey", () => {
  it("sem linhas: null", () => {
    expect(rowForKey([])).toBeNull();
  });

  it("vivas: regra R (updatedAt maior, depois id maior), em qualquer ordem", () => {
    const a = row("A", H2);
    const b = row("B", H1);
    expect(rowForKey([a, b])).toBe(a);
    expect(rowForKey([b, a])).toBe(a);
    const c = row("C", H2);
    expect(rowForKey([a, c])).toBe(c);
    expect(rowForKey([c, a])).toBe(c);
  });

  it("uma viva vence qualquer apagada, mesmo mais nova", () => {
    const viva = row("A", H1);
    const apagada = row("B", H2, true);
    expect(rowForKey([apagada, viva])).toBe(viva);
  });

  it("só apagadas: a de updatedAt maior (reviver é o comportamento de sempre)", () => {
    const velha = row("B", H1, true);
    const nova = row("A", H2, true);
    expect(rowForKey([velha, nova])).toBe(nova);
    expect(rowForKey([nova, velha])).toBe(nova);
  });
});
