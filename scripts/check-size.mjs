import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/**
 * Teto de bundle gzipado.
 * Calibrado ~2x acima do baseline atual para que regressao real dispare.
 * Elevar exige commit deliberado 2014 features legitimas (Dexie, Tailwind, router)
 * vao exigir subidas revisadas ate o alvo de ~140kb do README.
 */
export const LIMIT_BYTES = 10 * 1024;

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
