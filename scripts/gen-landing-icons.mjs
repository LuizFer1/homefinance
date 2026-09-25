/**
 * Injeta no `index.html` da landing um sprite SVG com os glifos Phosphor que ela
 * usa, entre os marcadores `<!-- icons:start -->` e `<!-- icons:end -->`.
 *
 * Mesma ideia do gen-icons.mjs do app, mas em HTML: a landing nao tem framework
 * para importar `phosphor-paths.ts`, e a fonte de icones do handoff viria de um
 * CDN — servico externo, proibido. Cada glifo vira um `<symbol id="i-nome">` e a
 * pagina usa `<svg><use href="#i-nome"/></svg>`: o path mora uma vez so no HTML,
 * mesmo quando o icone aparece varias vezes (a demo repete varios).
 *
 * Rodar depois de mudar a lista: `node scripts/gen-landing-icons.mjs`. O HTML
 * gerado e commitado; o build nao depende do pacote.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "node_modules", "@phosphor-icons", "core", "assets");
const htmlPath = join(root, "index.html");

/** [nome Phosphor, peso]. O id do simbolo e `i-<nome>` (`-fill` no peso cheio). */
const ICONS = [
  ["arrow-up-right", "regular"],
  ["arrow-down-right", "regular"],
  ["arrow-right", "regular"],
  ["arrows-left-right", "regular"],
  ["download-simple", "regular"],
  ["cell-signal-full", "fill"],
  ["battery-full", "fill"],
  ["trend-up", "regular"],
  ["fork-knife", "regular"],
  ["briefcase", "regular"],
  ["shopping-cart", "regular"],
  ["house", "regular"],
  ["house-line", "fill"],
  ["chart-pie-slice", "regular"],
  ["plus", "regular"],
  ["gear-six", "regular"],
  ["x", "regular"],
  ["car", "regular"],
  ["film-strip", "regular"],
  ["heartbeat", "regular"],
  ["shopping-bag", "regular"],
  ["check", "regular"],
  ["user-circle-minus", "regular"],
  ["wifi-slash", "regular"],
  ["lock-simple", "regular"],
  ["lightning", "regular"],
  ["coffee", "regular"],
  ["github-logo", "regular"],
  ["share", "regular"],
  ["dots-three-vertical", "regular"],
];

function symbol([name, weight]) {
  const file = weight === "fill" ? `${name}-fill.svg` : `${name}.svg`;
  const svg = readFileSync(join(assets, weight, file), "utf8");
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const id = weight === "fill" ? `i-${name}-fill` : `i-${name}`;
  return `      <symbol id="${id}" viewBox="0 0 256 256">${inner.trim()}</symbol>`;
}

const sprite = [
  "<!-- icons:start -->",
  '    <svg aria-hidden="true" width="0" height="0" style="position: absolute">',
  "      <!-- Gerado por scripts/gen-landing-icons.mjs. Nao editar a mao. -->",
  ...ICONS.map(symbol),
  "    </svg>",
  "    <!-- icons:end -->",
].join("\n");

const html = readFileSync(htmlPath, "utf8");
const marked = /<!-- icons:start -->[\s\S]*?<!-- icons:end -->/;
if (!marked.test(html)) {
  throw new Error("index.html sem os marcadores <!-- icons:start --> / <!-- icons:end -->");
}
writeFileSync(htmlPath, html.replace(marked, sprite));
console.log(`${ICONS.length} icones injetados em ${htmlPath}`);
