import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/**
 * Teto de bundle gzipado.
 * Elevar exige commit deliberado e revisavel — nunca de raspao junto com uma feature.
 * Historico:
 *   10kb  — baseline de tooling (Preact apenas, 4.76kb medidos)
 *   45kb  — nucleo de transacoes: Dexie e @preact/signals entram (42.25kb medidos)
 *   52kb  — camada visual: Tailwind e daisyUI entram (48.50kb medidos, sendo
 *           5.00kb de CSS; o daisyUI entra restrito a tema e raios, sem os
 *           componentes — os 61 componentes custariam ~4kb gzip a mais)
 * Alvo de projeto: ~140kb gzip, conforme o README.
 */
export const LIMIT_BYTES = 52 * 1024;

const MEASURED = /\.(js|css)$/;

/**
 * Soma o tamanho gzipado de todos os artefatos JS e CSS de um diretorio.
 * @param {string} dir
 * @returns {Promise<{ total: number, files: Array<{ file: string, size: number }> }>}
 */
export async function measureDist(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = [];
  let total = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !MEASURED.test(entry.name)) continue;

    const full = path.join(entry.parentPath, entry.name);
    const size = gzipSync(await readFile(full)).length;

    files.push({ file: path.relative(dir, full), size });
    total += size;
  }

  files.sort((a, b) => b.size - a.size);
  return { total, files };
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)}kb`;
}

async function main() {
  const dir = path.resolve("dist");
  const { total, files } = await measureDist(dir);

  for (const { file, size } of files) {
    console.log(`  ${kb(size).padStart(9)}  ${file}`);
  }

  if (total > LIMIT_BYTES) {
    console.error(
      `\nFALHOU: bundle em ${kb(total)} gzip, acima do teto de ${kb(LIMIT_BYTES)}.\n` +
        "Reduza o bundle ou eleve LIMIT_BYTES em scripts/check-size.mjs de forma deliberada.",
    );
    process.exit(1);
  }

  console.log(`\nOK: ${kb(total)} gzip, dentro do teto de ${kb(LIMIT_BYTES)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
