import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildExport, serializeExport } from "../domain/export/export-data";
import { MAX_IMPORT_BYTES } from "../domain/export/import-data";
import { TABLE_NAMES } from "../domain/model/app-state";
import type { Category } from "../domain/model/category";
import { createSession, LOCAL_USER_ID_KEY, StaleRowsError } from "../features/session/session";
import type { HomeFinanceDb } from "./db";
import { readAllRows } from "./export";
import { applyImport, prepareImport } from "./import";
import { openTestDb, testSessionDeps } from "./test-db.fake";

const MERCADO = { name: "Mercado", icon: "utensils", color: "emerald", kind: "expense" } as const;
const LAZER = { name: "Lazer", icon: "utensils", color: "teal", kind: "expense" } as const;

let source: HomeFinanceDb;
let target: HomeFinanceDb;

beforeEach(() => {
  source = openTestDb();
  target = openTestDb();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await source.delete();
  await target.delete();
});

const asFile = (text: string) => ({ size: text.length, text: async () => text });

async function sessionOf(db: HomeFinanceDb) {
  const session = createSession(testSessionDeps(db));
  await session.init();
  return session;
}

/** Exporta o banco como a tela de exportação faria. */
async function exportText(db: HomeFinanceDb): Promise<string> {
  return serializeExport(buildExport(await readAllRows(db), 0));
}

/** Estado das tabelas sem `dirty`, para comparar origem e destino. */
async function snapshot(db: HomeFinanceDb) {
  const state = await readAllRows(db);
  return buildExport(state, 0).tables;
}

async function importInto(db: HomeFinanceDb, text: string) {
  const session = await sessionOf(db);
  const prepared = await prepareImport(db, asFile(text));
  if (!prepared.ok) throw new Error(prepared.message);
  await applyImport(session, prepared.plan);
  return { session, plan: prepared.plan };
}

async function seedSource() {
  const session = await sessionOf(source);
  const mercado = await session.mutate("categories", (repo) => repo.create(MERCADO));
  const lazer = await session.mutate("categories", (repo) => repo.create(LAZER));
  await session.mutate("budgets", (repo) =>
    repo.create({ categoryId: mercado.id, limitMinor: 50_000 }),
  );
  await session.mutate("categories", (repo) => repo.remove(lazer.id));
  return { session, mercado, lazer };
}

describe("importar", () => {
  it("ida e volta: exportar e importar em banco limpo da o mesmo estado, lapides inclusive", async () => {
    await seedSource();

    const { plan } = await importInto(target, await exportText(source));

    expect(plan.total).toBe(3);
    expect(await snapshot(target)).toEqual(await snapshot(source));
    // Tabelas vazias continuam vazias; nada foi inventado.
    for (const table of TABLE_NAMES) {
      expect(Object.keys((await readAllRows(target))[table])).toHaveLength(
        Object.keys((await readAllRows(source))[table]).length,
      );
    }
  });

  it("as linhas importadas entram dirty para o sync propagar", async () => {
    await seedSource();

    await importInto(target, await exportText(source));

    const state = await readAllRows(target);
    const rows = TABLE_NAMES.flatMap((table) => Object.values(state[table]));
    expect(rows.length).toBe(3);
    expect(rows.every((row) => row.dirty === 1)).toBe(true);
  });

  it("idempotente: a segunda importacao nao muda nada", async () => {
    await seedSource();
    const text = await exportText(source);
    await importInto(target, text);
    const before = await readAllRows(target);

    const { plan } = await importInto(target, text);

    expect(plan.total).toBe(0);
    expect(plan.counts.categories.ignored).toBe(2);
    expect(await readAllRows(target)).toEqual(before);
  });

  it("nunca apaga o que ja esta no aparelho e nao esta no arquivo", async () => {
    await seedSource();
    // Direto no banco: duas sessoes de teste teriam o mesmo relogio e gerariam o mesmo id.
    const local = {
      ...(Object.values((await readAllRows(source)).categories)[0] as Category),
      id: "01J9F3K2M7QX8YB4TVWZ0DCAAA",
      name: "So aqui",
    };
    await target.categories.put(local);

    await importInto(target, await exportText(source));

    const state = await readAllRows(target);
    expect(state.categories[local.id]?.deletedAt).toBeNull();
    expect(state.categories[local.id]?.name).toBe("So aqui");
    expect(Object.keys(state.categories)).toHaveLength(3);
  });

  it("conflito LWW: local mais novo vence; arquivo mais novo vence", async () => {
    const { session: from, mercado } = await seedSource();
    await importInto(target, await exportText(source));

    // O destino edita depois: a edição local é mais nova que o arquivo.
    const targetSession = await sessionOf(target);
    await targetSession.mutate("categories", (repo) =>
      repo.update(mercado.id, { name: "Editado aqui" }),
    );
    const oldFile = await exportText(source);
    const { plan: noop } = await importInto(target, oldFile);
    expect(noop.counts.categories.updated).toBe(0);
    expect((await readAllRows(target)).categories[mercado.id]?.name).toBe("Editado aqui");

    // A origem edita depois ainda: o arquivo novo vence.
    await from.mutate("categories", (repo) =>
      repo.update(mercado.id, { name: "Editado na origem" }),
    );
    await from.mutate("categories", (repo) => repo.update(mercado.id, { name: "Final" }));
    const { plan } = await importInto(target, await exportText(source));
    expect(plan.counts.categories.updated).toBe(1);
    expect((await readAllRows(target)).categories[mercado.id]?.name).toBe("Final");
  });

  it("lapide do arquivo mais nova apaga a linha local mais velha", async () => {
    const { session: from, mercado } = await seedSource();
    await importInto(target, await exportText(source));
    await from.mutate("categories", (repo) => repo.remove(mercado.id));

    const { plan } = await importInto(target, await exportText(source));

    expect(plan.counts.categories.deleted).toBe(1);
    expect((await readAllRows(target)).categories[mercado.id]?.deletedAt).not.toBeNull();
  });

  it("lapide local mais nova nao e ressuscitada por linha viva mais velha do arquivo", async () => {
    const { mercado } = await seedSource();
    const text = await exportText(source);
    await importInto(target, text);
    const targetSession = await sessionOf(target);
    await targetSession.mutate("categories", (repo) => repo.remove(mercado.id));

    const { plan } = await importInto(target, text);

    expect(plan.total).toBe(0);
    expect((await readAllRows(target)).categories[mercado.id]?.deletedAt).not.toBeNull();
  });

  it("duas importacoes seguidas de arquivos diferentes somam", async () => {
    const { session } = await seedSource();
    const first = await exportText(source);
    await session.mutate("categories", (repo) => repo.create({ ...MERCADO, name: "Nova" }));
    const second = await exportText(source);

    await importInto(target, first);
    const { plan } = await importInto(target, second);

    expect(plan.counts.categories.created).toBe(1);
    expect(await snapshot(target)).toEqual(await snapshot(source));
  });

  it("arquivo invalido nao grava nada", async () => {
    await seedSource();
    const good = JSON.parse(await exportText(source));
    good.tables.categories[1].updatedAt = "quebrado";

    const prepared = await prepareImport(target, asFile(JSON.stringify(good)));

    expect(prepared.ok).toBe(false);
    for (const table of TABLE_NAMES) expect(await target.table(table).count()).toBe(0);
    const tooBig = await prepareImport(target, {
      size: MAX_IMPORT_BYTES + 1,
      text: async () => "",
    });
    expect(tooBig.ok).toBe(false);
  });

  it("tabela e campo desconhecidos degradam sem derrubar a importacao", async () => {
    await seedSource();
    const file = JSON.parse(await exportText(source));
    file.tables.tabelaDoFuturo = [{ id: "x" }];
    file.tables.categories[0].campoNovo = { a: 1 };

    const { plan } = await importInto(target, JSON.stringify(file));

    expect(plan.unknownTables).toEqual(["tabelaDoFuturo"]);
    const stored = Object.values((await readAllRows(target)).categories);
    expect(stored.some((row) => "campoNovo" in row)).toBe(true);
    expect(target.tables.map((t) => t.name)).not.toContain("tabelaDoFuturo");
  });

  it("nunca toca na meta", async () => {
    await seedSource();
    await target.meta.bulkPut([
      { key: "hubToken", value: "segredo" },
      { key: "hubCursor", value: "42" },
      { key: LOCAL_USER_ID_KEY, value: "EU" },
    ]);
    const before = await target.meta.toArray();

    await importInto(target, await exportText(source));

    const after = await target.meta.toArray();
    // `deviceId` nasce no primeiro init; o resto tem de ficar como estava.
    for (const entry of before) expect(after).toContainEqual(entry);
    expect(after.filter((e) => !before.some((b) => b.key === e.key)).map((e) => e.key)).toEqual([
      "deviceId",
    ]);
  });

  it("StaleRowsError: se o banco mudou depois da previa, nada e gravado", async () => {
    const { mercado } = await seedSource();
    const text = await exportText(source);
    const session = await sessionOf(target);
    const prepared = await prepareImport(target, asFile(text));
    if (!prepared.ok) throw new Error("previa");
    // Outra aba grava a mesma linha entre a previa e a confirmacao.
    await target.categories.put({
      ...(Object.values((await readAllRows(source)).categories).find(
        (c) => c.id === mercado.id,
      ) as Category),
      updatedAt: "1754697600999-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ",
    });
    const before = await snapshot(target);

    await expect(applyImport(session, prepared.plan)).rejects.toBeInstanceOf(StaleRowsError);

    expect(await snapshot(target)).toEqual(before);
    expect(await target.budgets.count()).toBe(0);
  });

  it("observe() recebe o maior updatedAt importado, e a proxima edicao local o supera", async () => {
    await seedSource();
    const file = JSON.parse(await exportText(source));
    // Relogio do outro aparelho muito adiantado.
    const future = "9990000000000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ";
    file.tables.categories[0].updatedAt = future;
    const session = await sessionOf(target);
    const prepared = await prepareImport(target, asFile(JSON.stringify(file)));
    if (!prepared.ok) throw new Error("previa");
    expect(prepared.plan.maxHlc).toBe(future);

    await applyImport(session, prepared.plan);

    const next = await session.mutate("categories", (repo) =>
      repo.create({ ...MERCADO, name: "Depois" }),
    );
    expect(next.updatedAt > future).toBe(true);
  });

  it("reflete na sessao sem recarregar a pagina", async () => {
    await seedSource();

    const { session } = await importInto(target, await exportText(source));

    expect(Object.keys(session.state.value.categories)).toHaveLength(2);
    expect(Object.keys(session.state.value.budgets)).toHaveLength(1);
  });
});
