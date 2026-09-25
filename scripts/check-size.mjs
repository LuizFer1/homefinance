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
 *   76kb  — recorrencia (72.23kb medidos no shell: JS+CSS) + folga. O teto de
 *           70kb ja tinha sido estourado pela fatia de recorrencia mergeada
 *           sem bump; este commit so ratifica. Service worker / Workbox
 *           continuam fora do gate (isAppShellArtifact) — offline e
 *           instalabilidade nao sao first paint da SPA.
 *   90kb  — redesign Nocturne (87.16kb medidos, sendo 10.69kb de CSS). Sai o
 *           lucide (4.88kb) e entram os caminhos Phosphor gerados so com os 67
 *           glifos usados (8.5kb, ja com uma casa decimal a menos por
 *           ponto); o resto e o Dashboard novo (ritmo, recorrentes a caminho,
 *           cashback) e os componentes do sistema. A fonte Inter fica fora do
 *           gate: e woff2 precacheado, nao JS nem CSS.
 * Alvo de projeto: ~140kb gzip, conforme o README.
 *
 * Service worker e runtime do Workbox **nao** entram neste teto: sao baixados
 * e cacheados a parte do shell da UI, e o tamanho deles e o preco de offline/
 * instalabilidade, nao do first paint da SPA. Ver isAppShellArtifact.
 *
 * A landing (index.html na raiz, artefatos `landing-*`) tem orcamento proprio,
 * LANDING_LIMIT_BYTES, e nao entra no teto do app: sao paginas separadas, uma
 * nunca carrega a outra. Somar as duas faria a vitrine comer a folga do app.
 */
export const LIMIT_BYTES = 90 * 1024;

/**
 * Teto da landing. Historico:
 *   15kb  — pagina de instalacao: HTML estatico, CSS a mao e um script sem
 *           framework (i18n EN/PT, prompt de instalacao, folha de doacao).
 */
export const LANDING_LIMIT_BYTES = 15 * 1024;

const MEASURED = /\.(js|css)$/;

/**
 * Artefatos do shell da SPA (first paint). Exclui SW / Workbox / registerSW
 * gerados pelo vite-plugin-pwa — medem outra camada do runtime.
 * @param {string} relativePath
 */
export function isAppShellArtifact(relativePath) {
  const base = path.basename(relativePath).toLowerCase();
  if (base === "sw.js" || base === "workbox-window.js") return false;
  if (base.startsWith("workbox-")) return false;
  if (base.includes("registersw")) return false;
  // Precache manifest embutido no SW; se aparecer solto, tambem fica de fora.
  if (base.includes("precache")) return false;
  return MEASURED.test(base);
}

/**
 * Artefatos da landing. O prefixo vem da chave `landing` do `rollupOptions.input`
 * em vite.config.ts — renomear a entrada la sem mudar aqui joga a landing de
 * volta no teto do app.
 * @param {string} relativePath
 */
export function isLandingArtifact(relativePath) {
  const base = path.basename(relativePath).toLowerCase();
  return base.startsWith("landing-") && isAppShellArtifact(relativePath);
}

/** @param {string} relativePath */
function isAppArtifact(relativePath) {
  return isAppShellArtifact(relativePath) && !isLandingArtifact(relativePath);
}

/**
 * Soma o tamanho gzipado dos artefatos JS e CSS de um diretorio que passam no
 * filtro — por padrao, os do app (sem a landing).
 * @param {string} dir
 * @param {(relativePath: string) => boolean} [include]
 * @returns {Promise<{ total: number, files: Array<{ file: string, size: number }> }>}
 */
export async function measureDist(dir, include = isAppArtifact) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = [];
  let total = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const relative = path.relative(dir, full);
    if (!include(relative)) continue;

    const size = gzipSync(await readFile(full)).length;

    files.push({ file: relative, size });
    total += size;
  }

  files.sort((a, b) => b.size - a.size);
  return { total, files };
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)}kb`;
}

/**
 * @param {string} label
 * @param {{ total: number, files: Array<{ file: string, size: number }> }} measured
 * @param {number} limit
 * @param {string} constant
 * @returns {boolean} true se coube no teto
 */
function report(label, { total, files }, limit, constant) {
  console.log(`${label}:`);
  for (const { file, size } of files) {
    console.log(`  ${kb(size).padStart(9)}  ${file}`);
  }
  if (total > limit) {
    console.error(
      `FALHOU: ${label} em ${kb(total)} gzip, acima do teto de ${kb(limit)}.\n` +
        `Reduza o bundle ou eleve ${constant} em scripts/check-size.mjs de forma deliberada.\n`,
    );
    return false;
  }
  console.log(`OK: ${kb(total)} gzip, dentro do teto de ${kb(limit)}.\n`);
  return true;
}

async function main() {
  const dir = path.resolve("dist");
  const app = report("app", await measureDist(dir), LIMIT_BYTES, "LIMIT_BYTES");
  const landing = report(
    "landing",
    await measureDist(dir, isLandingArtifact),
    LANDING_LIMIT_BYTES,
    "LANDING_LIMIT_BYTES",
  );
  // Os dois relatorios saem antes de falhar: estourar um nao esconde o outro.
  if (!app || !landing) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
