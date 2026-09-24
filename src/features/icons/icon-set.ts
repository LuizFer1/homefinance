import type { PhosphorName } from "./phosphor-paths";

/**
 * Chave persistida no log → glifo Phosphor.
 *
 * As chaves são as que o log já guarda desde a fatia de cadastros, e **não** os
 * nomes do Phosphor: trocar de biblioteca não pode reescrever evento nenhum. Um
 * "utensils" gravado em 2026 continua sendo "utensils" para sempre; só o desenho
 * que ele resolve mudou.
 *
 * Os caminhos moram em `phosphor-paths.ts`, gerado por `scripts/gen-icons.mjs`
 * só com os glifos listados — o pacote inteiro nunca entra no bundle.
 */
export const ICON_SET = {
  baby: "baby",
  banknote: "money",
  book: "book-open",
  briefcase: "briefcase",
  bus: "bus",
  calendar: "calendar-blank",
  car: "car",
  "chevron-down": "caret-down",
  coffee: "coffee",
  "credit-card": "credit-card",
  dog: "dog",
  dumbbell: "barbell",
  film: "film-strip",
  fuel: "gas-pump",
  gamepad: "game-controller",
  gift: "gift",
  graduation: "graduation-cap",
  health: "heartbeat",
  house: "house",
  landmark: "bank",
  music: "music-notes",
  "paw-print": "paw-print",
  "piggy-bank": "piggy-bank",
  pill: "pill",
  plane: "airplane",
  receipt: "receipt",
  scissors: "scissors",
  shirt: "t-shirt",
  "shopping-bag": "shopping-bag",
  "shopping-cart": "shopping-cart",
  smartphone: "device-mobile",
  tag: "tag",
  utensils: "fork-knife",
  wallet: "wallet",
  wifi: "wifi-high",
  zap: "lightning",
} as const satisfies Record<string, PhosphorName>;

export type IconKey = keyof typeof ICON_SET;

/**
 * Chave desconhecida cai aqui em vez de não renderizar nada. O log é eterno e um
 * aparelho de versão mais nova pode gravar uma chave que esta versão não conhece.
 */
export const FALLBACK_ICON: PhosphorName = "circle-dashed";

export const ICON_KEYS = Object.keys(ICON_SET) as IconKey[];

/**
 * O que a grade "Ícone" oferece, na ordem do handoff.
 *
 * `chevron-down` fica fora: é seta de interface que entrou no mapa por acidente
 * de uma fatia antiga. Continua resolvendo para quem já a gravou, mas deixar
 * escolhê-la como ícone de categoria seria propagar o acidente.
 */
export const PICKABLE_ICONS: readonly IconKey[] = [
  "baby",
  "banknote",
  "book",
  "briefcase",
  "bus",
  "calendar",
  "car",
  "coffee",
  "credit-card",
  "dog",
  "dumbbell",
  "film",
  "fuel",
  "gamepad",
  "gift",
  "graduation",
  "health",
  "house",
  "landmark",
  "music",
  "piggy-bank",
  "pill",
  "plane",
  "receipt",
  "scissors",
  "shirt",
  "shopping-bag",
  "shopping-cart",
  "smartphone",
  "tag",
  "utensils",
  "wallet",
  "wifi",
  "zap",
  "paw-print",
];
