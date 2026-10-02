import { describe, expect, it } from "vitest";
import { ALIVE } from "../domain/model/row.fake";
import { checkRemoteRow, isPullResponse, isPushResponse } from "./protocol";

const ROW = { ...ALIVE, id: "01J9F3K2M7QX8YB4TVWZ0DCEC1", name: "Mercado" };

describe("checkRemoteRow", () => {
  it("linha de tabela conhecida entra com dirty 0 e campos extras preservados", () => {
    const check = checkRemoteRow("categories", { ...ROW, dirty: 1, campoNovo: true });
    expect(check).toEqual({
      ok: true,
      table: "categories",
      row: { ...ROW, dirty: 0, campoNovo: true },
    });
  });

  it("tabela desconhecida é ignorada sem ser erro", () => {
    expect(checkRemoteRow("recurrenceAdjustmentsV9", ROW)).toEqual({
      ok: false,
      reason: "unknown_table",
    });
    expect(checkRemoteRow(42, ROW)).toEqual({ ok: false, reason: "unknown_table" });
  });

  it("linha fora do formato de BaseRow é inválida", () => {
    const invalid = { ok: false, reason: "invalid_row" };
    expect(checkRemoteRow("categories", null)).toEqual(invalid);
    expect(checkRemoteRow("categories", [ROW])).toEqual(invalid);
    expect(checkRemoteRow("categories", { ...ROW, id: "curto" })).toEqual(invalid);
    expect(checkRemoteRow("categories", { ...ROW, id: "01J9F3K2M7QX8YB4TVWZ0DCEIL" })).toEqual(
      invalid,
    );
    expect(checkRemoteRow("categories", { ...ROW, updatedAt: "ontem" })).toEqual(invalid);
    expect(checkRemoteRow("categories", { ...ROW, deletedAt: "ontem" })).toEqual(invalid);
    expect(checkRemoteRow("categories", { ...ROW, createdAt: 1 })).toEqual(invalid);
  });

  it("id determinístico (stableEntityId) é aceito mesmo começando com Z", () => {
    expect(checkRemoteRow("transactions", { ...ROW, id: "ZZZZZZZZZZZZZZZZZZZZZZZZZZ" }).ok).toBe(
      true,
    );
  });
});

describe("guards das respostas", () => {
  it("reconhecem o formato do hub e recusam o resto", () => {
    expect(isPushResponse({ epoch: "E", accepted: [], ignored: [], rejected: [], seq: 0 })).toBe(
      true,
    );
    expect(isPushResponse({ epoch: "E", accepted: [] })).toBe(false);
    expect(isPullResponse({ epoch: "E", rows: [], cursor: 0, hasMore: false })).toBe(true);
    expect(isPullResponse({ epoch: "E", rows: [], cursor: "0", hasMore: false })).toBe(false);
    expect(isPullResponse(null)).toBe(false);
  });
});
