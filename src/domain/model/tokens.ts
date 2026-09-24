/**
 * Paleta fechada, não hex livre: hex livre deixa o usuário escolher cinza sobre
 * cinza e quebra o contraste no tema escuro. O valor persistido é o nome; a
 * resolução para `oklch` vive no `app.css`.
 */
export const COLOR_TOKENS = [
  "slate",
  "rose",
  "red",
  "orange",
  "amber",
  "lime",
  "emerald",
  "teal",
  "sky",
  "indigo",
  "violet",
  "fuchsia",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

/** Destino de todo token sem cor própria ou desconhecido. */
export const NEUTRAL_TOKEN: ColorToken = "slate";

/** Chave no mapa estático de `features/icons`. Chave desconhecida cai num neutro. */
export type IconKey = string;
