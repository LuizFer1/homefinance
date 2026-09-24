/**
 * Gera `src/features/icons/phosphor-paths.ts` a partir de `@phosphor-icons/core`.
 *
 * O pacote tem ~9 mil SVGs; importar qualquer wrapper dele puxaria a biblioteca
 * inteira ou um runtime de React. Aqui só entram os `d` dos glifos listados, como
 * string literal — o bundle paga exatamente o que a tela desenha.
 *
 * Rodar depois de mudar a lista: `node scripts/gen-icons.mjs`. O arquivo gerado é
 * commitado; o build não depende do pacote, só esta etapa.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "node_modules", "@phosphor-icons", "core", "assets");

/** Peso regular. Chave = nome Phosphor. */
const REGULAR = [
  // Escolhíveis por categoria e forma de pagamento (ver `icon-set.ts`).
  "baby",
  "money",
  "book-open",
  "briefcase",
  "bus",
  "calendar-blank",
  "car",
  "coffee",
  "credit-card",
  "dog",
  "barbell",
  "film-strip",
  "gas-pump",
  "game-controller",
  "gift",
  "graduation-cap",
  "heartbeat",
  "house",
  "bank",
  "music-notes",
  "piggy-bank",
  "pill",
  "airplane",
  "receipt",
  "scissors",
  "t-shirt",
  "shopping-bag",
  "shopping-cart",
  "device-mobile",
  "tag",
  "fork-knife",
  "wallet",
  "wifi-high",
  "lightning",
  "paw-print",
  // Interface.
  "arrow-right",
  "arrows-clockwise",
  "arrow-up-right",
  "arrow-down-left",
  "calendar-check",
  "camera",
  "caret-down",
  "caret-left",
  "caret-right",
  "chart-pie-slice",
  "check",
  "circle-dashed",
  "circle-half",
  "coins",
  "gear-six",
  "image",
  "lock-simple",
  "minus",
  "moon",
  "plus",
  "prohibit",
  "repeat",
  "sun",
  "trash",
  "trend-down",
  "trend-up",
  "warning",
  "x",
];

/** Peso preenchido: aba ativa e "Escuro" selecionado. */
const FILL = ["chart-pie-slice", "house", "gear-six", "moon"];

function pathsOf(file) {
  const svg = readFileSync(file, "utf8");
  const found = [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
  // Glifo com <circle>/<rect> sairia desenhado pela metade em silêncio.
  if (found.length === 0 || /<(rect|circle|line|polyline|polygon|ellipse)\b/.test(svg)) {
    throw new Error(`Glifo sem suporte (só <path>): ${file}`);
  }
  // Uma casa decimal num viewBox de 256 é 1/2560 do lado: a 24px, um centésimo
  // de pixel. As duas casas do original custavam ~15% do gzip sem mudar um pixel.
  //
  // O número arredondado mantém a forma do original (com ou sem inteiro, sempre
  // com ponto): o SVG compacto encosta números (`-.73.13`), e um `-0` sem ponto
  // colado no dígito anterior fundiria dois números num só.
  return found.join(" ").replace(/-?\d*\.\d{2,}/g, (n) => {
    const fixed = (Math.round(Number(n) * 10) / 10).toFixed(1);
    return /^-?\./.test(n) ? fixed.replace(/^(-?)0\./, "$1.") : fixed;
  });
}

const entries = [
  ...REGULAR.map((name) => [name, pathsOf(join(assets, "regular", `${name}.svg`))]),
  ...FILL.map((name) => [`${name}-fill`, pathsOf(join(assets, "fill", `${name}-fill.svg`))]),
];

const body = entries.map(([name, d]) => `  "${name}": "${d}",`).join("\n");

writeFileSync(
  join(root, "src", "features", "icons", "phosphor-paths.ts"),
  `// Gerado por scripts/gen-icons.mjs a partir de @phosphor-icons/core (MIT). Não editar.\n` +
    `// viewBox 0 0 256 256, fill currentColor.\n` +
    `export const PHOSPHOR = {\n${body}\n} as const;\n\n` +
    `export type PhosphorName = keyof typeof PHOSPHOR;\n`,
);

console.log(`${entries.length} glifos gerados.`);
