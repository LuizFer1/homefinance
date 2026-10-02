/**
 * Sugestão para "Nome deste aparelho": é o que a tela Conexão do hub mostra
 * como modelo. Editável; o chute só poupa digitação.
 */
export function guessDeviceName(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent)) return "iPad";
  if (/Android/.test(userAgent)) return "Android";
  if (/Windows/.test(userAgent)) return "Computador Windows";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/Linux/.test(userAgent)) return "Linux";
  return "Celular";
}
