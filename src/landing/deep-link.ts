/**
 * O QR do hub aponta para a raiz do site (esta landing); o app mora em `app/`.
 * Devolve a URL do app com o mesmo fragmento, ou null quando não é deep link
 * do hub. O fragmento nunca sai do navegador — por isso ele, e não a query.
 */
export function hubDeepLinkTarget(hash: string, href: string): string | null {
  if (!hash.startsWith("#hub=")) return null;
  // `.../index.html` é a mesma landing: o app fica ao lado do arquivo, não dentro dele.
  const base = href.replace(/[?#].*$/, "").replace(/\/index\.html$/i, "/");
  return `${base.endsWith("/") ? base : `${base}/`}app/${hash}`;
}
