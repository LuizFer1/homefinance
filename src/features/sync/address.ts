export const HUB_PORT = 7777;
/** Porta HTTP simples do hub: só a CA e o guia de instalação. */
export const CA_PORT = 7778;

const HOST =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)$/;
const TOKEN = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * `192.168.0.5`, `192.168.0.5:7777` e `https://192.168.0.5:7777/` viram
 * `192.168.0.5:7777`. O esquema é ignorado de propósito: a API é sempre https,
 * e quem cola a URL do guia (`http://...:7778`) só erra a porta.
 */
export function normalizeAddress(input: string): string | null {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const parts = text.split(":");
  const host = parts[0];
  if (parts.length > 2 || host === undefined || host === "" || !HOST.test(host)) return null;
  const portText = parts[1];
  const port = portText === undefined || portText === "" ? HUB_PORT : Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return `${host}:${port}`;
}

/** Como a pessoa digita: `abc-def`, `ABC DEF` e `ABCDEF` são o mesmo código. */
export function normalizeToken(input: string): string | null {
  const token = input.replace(/[-\s]/g, "").toUpperCase();
  return TOKEN.test(token) ? token : null;
}

export function hubBaseUrl(address: string): string {
  return `https://${address}`;
}

/** O guia da CA é servido por HTTP simples, porque precisa existir antes da confiança. */
export function caGuideUrl(address: string): string {
  const host = address.slice(0, address.lastIndexOf(":"));
  return `http://${host}:${CA_PORT}/`;
}
