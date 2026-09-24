import { describe, expect, it } from "vitest";
import { createRowClock } from "../../domain/clock/row-clock";
import { LOCAL_USER_ID_KEY } from "../session/session";
import { buildOnboardingRows } from "./seed";

const LUIZ = { name: "Luiz", color: "teal", avatar: null } as const;

function clock() {
  let millis = 1_754_697_600_000;
  return createRowClock({
    deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHZ",
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  });
}

describe("buildOnboardingRows", () => {
  it("monta perfil, 4 formas, 12 categorias e aponta localUserId", () => {
    const { rows, meta } = buildOnboardingRows(LUIZ, clock());

    expect(rows.users).toHaveLength(1);
    expect(rows.paymentMethods?.map((m) => m.kind)).toEqual(["cash", "pix", "credit", "debit"]);
    expect(rows.categories).toHaveLength(12);
    expect(meta[LOCAL_USER_ID_KEY]).toBe(rows.users?.[0]?.id);
  });

  it("todas as linhas têm id distinto", () => {
    const { rows } = buildOnboardingRows(LUIZ, clock());
    const ids = [
      ...(rows.users ?? []),
      ...(rows.paymentMethods ?? []),
      ...(rows.categories ?? []),
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
