import type { ColorToken } from "../../domain/events/reference";
import { COLOR_TOKENS, NEUTRAL_TOKEN } from "../../domain/projections/entities";

export { COLOR_TOKENS };

const KNOWN = new Set<string>(COLOR_TOKENS);

/** Neutro da paleta. Token desconhecido cai aqui em vez de sumir da tela. */
export const FALLBACK_TOKEN = NEUTRAL_TOKEN;

/**
 * Nome que a pessoa lê, por token.
 *
 * O token gravado no log é o nome técnico antigo (`red`, `indigo`…) e **não
 * muda**: renomear exigiria reescrever evento. O redesign recalculou o valor de
 * cada um — `red` virou um coral, `indigo` um azul —, então o nome exibido segue
 * o valor novo, não a chave.
 */
export const COLOR_NAMES: Record<ColorToken, string> = {
  slate: "Cinza",
  rose: "Rosa",
  red: "Coral",
  orange: "Laranja",
  amber: "Âmbar",
  lime: "Lima",
  emerald: "Verde",
  teal: "Turquesa",
  sky: "Céu",
  indigo: "Azul",
  violet: "Violeta",
  fuchsia: "Magenta",
};

export function colorName(token: string): string {
  return KNOWN.has(token) ? COLOR_NAMES[token as ColorToken] : COLOR_NAMES[FALLBACK_TOKEN];
}

/**
 * Resolve o token persistido para a variável CSS que o `app.css` define, com um
 * valor por tema.
 *
 * Os valores moram no CSS e não num objeto TypeScript: é isso que faz o tema
 * escuro funcionar sem JavaScript e sem um segundo lugar para esquecer de
 * atualizar. Token desconhecido — vindo de uma versão futura via sync — cai no
 * neutro; o fold aceitou o valor de propósito, e descartar aqui perderia a
 * informação para sempre.
 */
export function cssVarForToken(token: string): string {
  const safe = KNOWN.has(token) ? token : FALLBACK_TOKEN;
  return `var(--color-tag-${safe})`;
}

/**
 * Tile de ícone de categoria: fundo a 18% da cor, ícone na cor cheia.
 *
 * Um lugar só para a receita, porque ela aparece em seis telas; seis cópias do
 * `color-mix` divergem no primeiro ajuste de opacidade.
 */
export function tileStyle(token: string, strength = 18): Record<string, string> {
  const color = cssVarForToken(token);
  return {
    backgroundColor: `color-mix(in oklch, ${color} ${strength}%, transparent)`,
    color,
  };
}
