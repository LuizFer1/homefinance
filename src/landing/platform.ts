export type Platform = "ios" | "android" | "desktop";

export interface PlatformSignals {
  userAgent: string;
  maxTouchPoints: number;
  /** `matchMedia("(pointer: coarse)")` — dedo, nao mouse. */
  coarse: boolean;
}

/**
 * Decide qual versao da landing mostrar. Pura: recebe os sinais em vez de ler
 * `navigator`, porque e o unico jeito de testar iPad, que desde o iPadOS 13 manda
 * o mesmo UA de um MacBook — so o toque separa os dois.
 */
export function detectPlatform({ userAgent, maxTouchPoints, coarse }: PlatformSignals): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";
  // Toque sem UA conhecido (tablet generico, navegador exotico): as instrucoes
  // do Android — menu do navegador, "Instalar" — sao as que mais se aplicam.
  if (coarse) return "android";
  return "desktop";
}
