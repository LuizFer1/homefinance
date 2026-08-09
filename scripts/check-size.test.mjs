import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { LIMIT_BYTES, measureDist } from "./check-size.mjs";

async function fixture(files) {
  const dir = await mkdtemp(path.join(tmpdir(), "hf-size-"));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

test("soma o tamanho gzipado de arquivos js e css", async () => {
  const dir = await fixture({
    "assets/app.js": "console.log('hello');",
    "assets/style.css": "body{margin:0}",
  });

  const { total, files } = await measureDist(dir);

  expect(files).toHaveLength(2);
  expect(total).toBeGreaterThan(0);
});

test("ignora arquivos que nao sao js nem css", async () => {
  const dir = await fixture({
    "index.html": "<!doctype html>",
    "icon.svg": "<svg></svg>",
    "assets/app.js": "console.log('hello');",
  });

  const { files } = await measureDist(dir);

  expect(files.map((f) => path.basename(f.file))).toEqual(["app.js"]);
});

test("percorre subdiretorios aninhados", async () => {
  const dir = await fixture({
    "assets/deep/nested/chunk.js": "export const x = 1;",
  });

  const { files } = await measureDist(dir);

  expect(files).toHaveLength(1);
});

test("devolve total zero quando nao ha artefatos", async () => {
  const dir = await fixture({ "index.html": "<!doctype html>" });

  const { total, files } = await measureDist(dir);

  expect(total).toBe(0);
  expect(files).toEqual([]);
});

test("o teto esta declarado em 60kb", () => {
  expect(LIMIT_BYTES).toBe(60 * 1024);
});
