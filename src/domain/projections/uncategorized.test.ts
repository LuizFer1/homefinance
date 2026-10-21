import { describe, expect, it } from "vitest";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { stateOf, tx } from "../reserves/fixtures.fake";
import { listTransactions } from "./selectors";
import { suggestionsFor, uncategorized } from "./uncategorized";

const CAT = "cat-viva";
const DEAD = "cat-morta";

const state = {
  ...stateOf({
    transactions: [
      tx("ok", "expense", 1_000, "2026-09-01", CAT, { description: "Padaria" }),
      tx("nula", "expense", 2_000, "2026-09-02", null, { description: "Padaria do Zé" }),
      tx("morta", "expense", 3_000, "2026-09-03", DEAD, { description: "Cinema" }),
      tx("transf", "expense", 4_000, "2026-09-04", null, { reportState: "transfer" }),
      tx("oculta", "expense", 5_000, "2026-09-05", null, { reportState: "hidden" }),
      tx("apagada", "expense", 6_000, "2026-09-06", null, { deletedAt: DELETED_AT }),
    ],
  }),
  categories: {
    [CAT]: {
      ...ALIVE,
      id: CAT,
      name: "Alimentação",
      icon: "utensils",
      color: "sky" as const,
      kind: "expense" as const,
    },
    [DEAD]: {
      ...ALIVE,
      id: DEAD,
      name: "Antiga",
      icon: "tag",
      color: "sky" as const,
      kind: "expense" as const,
      deletedAt: DELETED_AT,
    },
  },
};

describe("uncategorized", () => {
  it("inclui categoria nula e apagada; exclui marcados e lançamentos apagados", () => {
    const ids = uncategorized(listTransactions(state), state).map((item) => item.id);
    expect(ids.sort()).toEqual(["morta", "nula"]);
  });

  it("bate com o 'Sem categoria' do Dashboard: mesmo valor total", () => {
    const sum = uncategorized(listTransactions(state), state).reduce(
      (total, item) => total + item.amountMinor,
      0,
    );
    expect(sum).toBe(5_000);
  });
});

describe("suggestionsFor", () => {
  it("sugere pelo histórico e só para quem tem", () => {
    const items = uncategorized(listTransactions(state), state);
    const suggestions = suggestionsFor(items, state);
    // "Padaria do Zé" começa por "Padaria", categorizada como Alimentação.
    expect(suggestions.get("nula")).toBe(CAT);
    expect(suggestions.has("morta")).toBe(false);
  });
});
