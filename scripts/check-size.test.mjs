import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  isAppShellArtifact,
  isLandingArtifact,
  isPdfArtifact,
  LANDING_LIMIT_BYTES,
  LIMIT_BYTES,
  measureDist,
  PDF_LIMIT_BYTES,
} from "./check-size.mjs";

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

test("o teto esta declarado em 95kb", () => {
  expect(LIMIT_BYTES).toBe(95 * 1024);
});

test("o teto da landing esta declarado em 15kb", () => {
  expect(LANDING_LIMIT_BYTES).toBe(15 * 1024);
});

test("landing e app sao medidos em orcamentos separados", async () => {
  // A landing nunca carrega o app, nem o contrario: somar as duas faria a
  // vitrine comer a folga do app.
  expect(isLandingArtifact("assets/landing-abc123.js")).toBe(true);
  expect(isLandingArtifact("assets/landing-abc123.css")).toBe(true);
  expect(isLandingArtifact("assets/app-abc123.js")).toBe(false);
  expect(isLandingArtifact("assets/landing-qr.svg")).toBe(false);

  const dir = await fixture({
    "assets/app-1.js": "console.log('app');",
    "assets/landing-1.js": "console.log('landing');",
    "assets/landing-1.css": "body{margin:0}",
  });

  const app = await measureDist(dir);
  const landing = await measureDist(dir, isLandingArtifact);
  expect(app.files.map((f) => path.basename(f.file))).toEqual(["app-1.js"]);
  expect(landing.files.map((f) => path.basename(f.file)).sort()).toEqual([
    "landing-1.css",
    "landing-1.js",
  ]);
});

test("service worker e workbox ficam fora do teto do shell", async () => {
  // Offline/instalabilidade tem o proprio runtime; o gate mede first paint da SPA.
  expect(isAppShellArtifact("sw.js")).toBe(false);
  expect(isAppShellArtifact("workbox-abc123.js")).toBe(false);
  expect(isAppShellArtifact("assets/index-xyz.js")).toBe(true);

  const dir = await fixture({
    "assets/app.js": "console.log('hello');",
    "sw.js": "self.addEventListener('fetch', () => {});",
    "workbox-deadbeef.js": "export const x = 1;",
  });

  const { files } = await measureDist(dir);
  expect(files.map((f) => path.basename(f.file))).toEqual(["app.js"]);
});

test("o teto do leitor de PDF esta declarado em 500kb", () => {
  expect(PDF_LIMIT_BYTES).toBe(500 * 1024);
});

test("o leitor de PDF sai do teto do app e mede o worker .mjs", async () => {
  expect(isPdfArtifact("assets/pdf-text-abc123.js")).toBe(true);
  expect(isPdfArtifact("assets/pdf.worker.min-abc123.mjs")).toBe(true);
  expect(isPdfArtifact("assets/app-abc123.js")).toBe(false);

  const dir = await fixture({
    "assets/app-abc.js": "console.log('app');",
    "assets/pdf-text-abc.js": "console.log('pdf');",
  });
  const { files } = await measureDist(dir);
  expect(files.map((f) => path.basename(f.file))).toEqual(["app-abc.js"]);
});
