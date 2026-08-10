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
 *   60kb  — entidades de referencia: lucide-preact com 34 icones literais e a
 *           UI de cadastro (57.32kb medidos, sendo 6.11kb de CSS; os icones
 *           custam 4.88kb dos 7.94kb de aumento, medidos por sonda antes de
 *           qualquer arquivo depender da biblioteca)
 *   66kb  — modal de lancamento, fila de acoes e barra com icones (60.10kb
 *           medidos, sendo 6.9kb de CSS). Sem dependencia nova: o <dialog> e
 *           nativo e os icones ja estavam no ICON_SET. A folga anterior era de
 *           0.31kb, entao qualquer feature estouraria.
 *   70kb  — perfil e primeiro uso (65.74kb medidos) mais o extrato agrupado por
 *           dia (66.25kb medidos, sendo 7.37kb de CSS). Duas fatias, nenhuma
 *           dependencia nova: o pipeline de foto usa createImageBitmap e
 *           canvas.toDataURL, ambos nativos, e o icone da linha ja estava no
 *           ICON_SET. A folga anterior era de 0.26kb — o teto de 66kb foi
 *           calculado para a fatia que o pediu e nao sobrou para a seguinte.
 *           Os 3.75kb de folga agora sao deliberados: a fatia 4 (exportar,
 *           importar, apagar dados) ja tem plano e vai gastar.
 * Alvo de projeto: ~140kb gzip, conforme o README.
 */
export const LIMIT_BYTES = 70 * 1024;

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
