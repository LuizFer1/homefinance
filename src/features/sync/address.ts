export const HUB_PORT = 7777;
/** Porta HTTP simples do hub: só a CA e o guia de instalação. */
export const CA_PORT = 7778;

const HOST =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const TOKEN = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * `localhost`, 127/8, 10/8, 172.16/12 e 192.168/16: o mesmo conjunto das name
 * constraints da CA do hub. O endereço vem de um QR ou de um link, e o app
 * manda para ele a chave e todo o financeiro — um `#hub=evil.example:443`
 * aceito aqui levaria tudo para fora de casa. Nome de host além de
 * `localhost` fica de fora: a CA do hub também não o assinaria.
 */
function isLocalHost(host: string): boolean {
  if (host === "localhost") return true;
  const match = IPV4.exec(host);
  if (match === null) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [a = -1, b = -1] = octets;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

type AddressCheck = { ok: true; address: string } | { ok: false; reason: "format" | "not_local" };

function checkAddress(input: string): AddressCheck {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const parts = text.split(":");
  const host = parts[0];
  if (parts.length > 2 || host === undefined || host === "" || !HOST.test(host)) {
    return { ok: false, reason: "format" };
  }
  const portText = parts[1];
  const port = portText === undefined || portText === "" ? HUB_PORT : Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, reason: "format" };
  if (!isLocalHost(host)) return { ok: false, reason: "not_local" };
  return { ok: true, address: `${host}:${port}` };
}

/**
 * `192.168.0.5`, `192.168.0.5:7777` e `https://192.168.0.5:7777/` viram
 * `192.168.0.5:7777`. O esquema é ignorado de propósito: a API é sempre https,
 * e quem cola a URL do guia (`http://...:7778`) só erra a porta. Fora da rede
 * de casa (ver `isLocalHost`) é null, como um endereço malformado.
 */
export function normalizeAddress(input: string): string | null {
  const check = checkAddress(input);
  return check.ok ? check.address : null;
}

/** Por que o endereço foi recusado, para a tela e para o erro do pareamento; null se vale. */
export function addressProblem(input: string): string | null {
  const check = checkAddress(input);
  if (check.ok) return null;
  return check.reason === "not_local"
    ? "O hub precisa estar na sua rede de casa: use o IP do computador (192.168.x.x, 10.x.x.x ou 172.16 a 172.31) ou localhost. Endereços da internet são recusados."
    : "Endereço do hub inválido. Use ip:porta, como 192.168.0.5:7777.";
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
