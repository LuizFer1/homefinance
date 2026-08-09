import { COLOR_TOKENS } from "../../domain/projections/entities";

export { COLOR_TOKENS };

const KNOWN = new Set<string>(COLOR_TOKENS);

/** Neutro da paleta. Token desconhecido cai aqui em vez de sumir da tela. */
export const FALLBACK_TOKEN = "slate";

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
