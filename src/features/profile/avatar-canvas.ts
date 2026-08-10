import type { AvatarDeps } from "./avatar";

/**
 * Ligação com o navegador — e só isso.
 *
 * Não tem teste unitário porque não tem decisão: recorte, laço de qualidade e
 * teto vivem em `avatar.ts`, que é puro e testado. `happy-dom` não implementa
 * canvas, então cobrir estas linhas exigiria um navegador de verdade para
 * verificar quatro argumentos de `drawImage`.
 *
 * Nenhuma dependência nova: `createImageBitmap` e `toDataURL` são nativos, e o
 * teto de bundle é uma feature declarada do produto.
 */
export const browserAvatarDeps: AvatarDeps = {
  decode: (file) => createImageBitmap(file),

  encode: async (source, crop, size, quality) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Nao foi possivel preparar a imagem neste navegador.");

    ctx.drawImage(
      source as CanvasImageSource,
      crop.x,
      crop.y,
      crop.size,
      crop.size,
      0,
      0,
      size,
      size,
    );

    const webp = canvas.toDataURL("image/webp", quality);
    // `toDataURL` cai para PNG em silêncio onde WebP não é suportado, e um PNG
    // de 96px estoura o teto sem chance de caber em nenhuma qualidade — a
    // qualidade nem se aplica a PNG. JPEG é o degrau que ainda responde ao laço.
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
  },
};
