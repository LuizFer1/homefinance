import { signal } from "@preact/signals";
import { HELP_STRUCTURE } from "./content";

const PREFIX = "#ajuda=";

/** Pergunta pedida por link ("" = só abrir a Ajuda), ou null. Lida pela tela de Ajuda, que a zera. */
export const pendingHelp = signal<string | null>(null);

/** Link de uma pergunta, relativo ao endereço atual do app. */
export function helpLink(id: string): string {
  return `${PREFIX}${encodeURIComponent(id)}`;
}

/** `#ajuda=<id>`; null se não for um link de pergunta conhecida. */
export function parseHelpLink(hash: string): string | null {
  if (!hash.startsWith(PREFIX)) return null;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(PREFIX.length));
  } catch {
    return null;
  }
  return HELP_STRUCTURE.some((entry) => entry.id === id) ? id : null;
}

export interface HelpLocation {
  hash: string;
  pathname: string;
  search: string;
}

export interface HelpHistory {
  replaceState: (data: unknown, unused: string, url?: string) => void;
}

/**
 * Lê e limpa o fragmento. Deixá-lo na barra faria um recarregamento, dias
 * depois, reabrir a Ajuda no meio de outra tarefa; a pessoa copia o link de
 * novo pelo botão da pergunta. Chamado no boot e no `hashchange`, que cobre o
 * app já aberto quando um link chega.
 */
export function consumeHelpLink(location: HelpLocation, history: HelpHistory): string | null {
  if (!location.hash.startsWith(PREFIX)) return null;
  // Id desconhecido vira "": abre a Ajuda inteira em vez de ignorar o link.
  const id = parseHelpLink(location.hash) ?? "";
  history.replaceState(null, "", location.pathname + location.search);
  return id;
}
