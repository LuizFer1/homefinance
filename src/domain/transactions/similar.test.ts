import { describe, expect, it } from "vitest";
import { stateOf, tx } from "../reserves/fixtures.fake";
import { findSimilar } from "./similar";

const FOOD = "cat-alimentacao";
const TRANSPORT = "cat-transporte";

const state = stateOf({
  transactions: [
    tx("src", "expense", 1_000, "2026-09-01", FOOD, { description: "Uber Trip" }),
    tx("caixa", "expense", 1_000, "2026-08-01", null, { description: "UBER TRIP" }),
    tx("acento", "expense", 1_000, "2026-08-05", TRANSPORT, { description: "Úber  Trip!" }),
    tx("loja", "expense", 1_000, "2026-08-09", null, { description: "uber trip 1234" }),
    tx("outra", "expense", 1_000, "2026-08-03", null, { description: "Uber Eats" }),
    tx("receita", "income", 1_000, "2026-08-04", null, { description: "Uber Trip" }),
    tx("ja", "expense", 1_000, "2026-08-06", FOOD, { description: "Uber Trip" }),
    tx("numeros", "expense", 1_000, "2026-08-07", null, { description: "12345" }),
  ],
});

const base = {
  sourceId: "src",
  description: "Uber Trip",
  kind: "expense",
  categoryId: FOOD,
} as const;

describe("findSimilar", () => {
  it("casa a mesma loja escrita com caixa, acento, pontuação e número de loja", () => {
    const ids = findSimilar(state, base).map((row) => row.id);
    expect(ids).toEqual(["loja", "acento", "caixa"]);
  });

  it("não inclui o próprio, outro tipo, outra loja nem quem já está na categoria", () => {
    const ids = findSimilar(state, base).map((row) => row.id);
    for (const out of ["src", "receita", "outra", "ja"]) expect(ids).not.toContain(out);
  });

  it("ignora lançamentos apagados", () => {
    const deleted = stateOf({
      transactions: [tx("x", "expense", 1, "2026-08-01", null, { description: "Uber Trip" })],
    });
    const row = deleted.transactions.x;
    if (row === undefined) throw new Error("fixture");
    deleted.transactions.x = { ...row, deletedAt: "2026-08-02T00:00:00.000Z-0000-X" };
    expect(findSimilar(deleted, base)).toEqual([]);
  });

  it("descrição só de números não casa com nada", () => {
    expect(findSimilar(state, { ...base, description: "12345" })).toEqual([]);
  });
});
