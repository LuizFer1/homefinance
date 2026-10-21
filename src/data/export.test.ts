import { describe, expect, it, vi } from "vitest";
import { buildExport } from "../domain/export/export-data";
import { TABLE_NAMES } from "../domain/model/app-state";
import { ALIVE, DELETED_AT } from "../domain/model/row.fake";
import { downloadTextFile, exportAll, readAllRows } from "./export";
import { openTestDb } from "./test-db.fake";

describe("readAllRows", () => {
  it("le todas as tabelas com lapides e nao le a meta", async () => {
    const db = openTestDb();
    await db.budgets.bulkPut([
      { ...ALIVE, id: "A", categoryId: "C", limitMinor: 100, dirty: 1 },
      { ...ALIVE, id: "B", categoryId: "D", limitMinor: 200, deletedAt: DELETED_AT },
    ]);
    await db.meta.put({ key: "hubToken", value: "segredo" });

    const state = await readAllRows(db);
    const file = buildExport(state, 0);

    expect(Object.keys(state).sort()).toEqual([...TABLE_NAMES].sort());
    expect(file.tables.budgets.map((row) => row.id)).toEqual(["A", "B"]);
    expect(file.tables.budgets[1]?.deletedAt).toBe(DELETED_AT);
    expect(JSON.stringify(file)).not.toContain("segredo");
    expect(JSON.stringify(file)).not.toContain("hubToken");
  });
});

describe("downloadTextFile", () => {
  it("clica num link com o nome e o conteudo, e limpa depois", () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const link = document.createElement("a");
    link.click = click;
    const doc = { createElement: () => link, body: document.body };
    const url = { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() };

    downloadTextFile({ doc, url }, "homefinance-2026-10-21.json", "{}");

    expect(link.download).toBe("homefinance-2026-10-21.json");
    expect(link.href).toBe("blob:x");
    expect(click).toHaveBeenCalledOnce();
    expect(link.isConnected).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(url.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    vi.useRealTimers();
  });
});

describe("exportAll", () => {
  it("baixa o JSON com o nome do dia e as lapides do banco", async () => {
    const db = openTestDb();
    await db.budgets.put({
      ...ALIVE,
      id: "A",
      categoryId: "C",
      limitMinor: 1,
      deletedAt: DELETED_AT,
    });
    let blob: Blob | null = null;
    const link = document.createElement("a");
    link.click = () => {};
    const url = {
      createObjectURL: (value: Blob) => {
        blob = value;
        return "blob:x";
      },
      revokeObjectURL: () => {},
    };

    await exportAll(db, Date.UTC(2026, 9, 21), "2026-10-21", {
      doc: { createElement: () => link, body: document.body },
      url,
    });

    expect(link.download).toBe("homefinance-2026-10-21.json");
    const file = JSON.parse(await (blob as unknown as Blob).text());
    expect(file.app).toBe("homefinance");
    expect(Object.keys(file.tables)).toHaveLength(TABLE_NAMES.length);
    expect(file.tables.budgets[0].deletedAt).toBe(DELETED_AT);
    expect(file.tables.budgets[0]).not.toHaveProperty("dirty");
    expect(file).not.toHaveProperty("meta");
  });
});
