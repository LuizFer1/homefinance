import { normalizeAddress, normalizeToken } from "./address";

export interface HubDeepLink {
  address: string;
  token: string;
}

const PREFIX = "#hub=";

/** `#hub=<ip>:7777&token=<token>`, o fragmento que o guia do hub põe no link do app. */
export function parseHubDeepLink(hash: string): HubDeepLink | null {
  if (!hash.startsWith(PREFIX)) return null;
  const params = new URLSearchParams(hash.slice(1));
  const address = normalizeAddress(params.get("hub") ?? "");
  const token = normalizeToken(params.get("token") ?? "");
  return address === null || token === null ? null : { address, token };
}

export interface LocationLike {
  hash: string;
  pathname: string;
  search: string;
}

export interface HistoryLike {
  replaceState: (data: unknown, unused: string, url?: string) => void;
}

/**
 * Lê e limpa. O token é de uso único e vale cinco minutos, mas não tem por que
 * ficar na barra de endereço, no histórico nem num "compartilhar aba" — mesmo
 * quando veio inválido.
 */
export function consumeHubDeepLink(
  location: LocationLike,
  history: HistoryLike,
): HubDeepLink | null {
  if (!location.hash.startsWith(PREFIX)) return null;
  const link = parseHubDeepLink(location.hash);
  history.replaceState(null, "", location.pathname + location.search);
  return link;
}
