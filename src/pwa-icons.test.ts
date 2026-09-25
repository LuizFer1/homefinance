import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => path.join(process.cwd(), ...parts);

/** Largura e altura reais de um PNG, lidas do cabecalho IHDR (bytes 16–23). */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const config = readFileSync(read("vite.config.ts"), "utf8");
const icons = [
  ...config.matchAll(/src:\s*"(img\/icons\/[^"]+\.png)",\s*sizes:\s*"(\d+)x(\d+)"/g),
].map(([, src = "", w = "", h = ""]) => ({ src, width: Number(w), height: Number(h) }));

/*
 * O Chrome so escolhe icone principal quadrado: com todos em 192x204 e 512x544
 * ele recusava a instalacao com `no-acceptable-icon`, na landing e no app, e o
 * botao "Instalar" nunca aparecia. Nenhum outro criterio de instalabilidade
 * falhava — por isso a regra mora num teste, e nao so num comentario.
 */
describe("icones do manifest", () => {
  it("o manifest declara icones", () => {
    expect(icons.length).toBeGreaterThan(0);
  });

  it("todo icone e declarado quadrado", () => {
    for (const icon of icons) expect(icon.width, icon.src).toBe(icon.height);
  });

  it("o tamanho declarado e o tamanho real do arquivo", () => {
    for (const icon of icons) {
      expect(pngSize(read("public", icon.src)), icon.src).toEqual({
        width: icon.width,
        height: icon.height,
      });
    }
  });

  it("ha icone 'any' de pelo menos 144px, o minimo do Chrome", () => {
    const any = config.match(/sizes:\s*"(\d+)x\d+",\s*type:\s*"image\/png",\s*purpose:\s*"any"/g);
    const sizes = (any ?? []).map((s) => Number(/"(\d+)x/.exec(s)?.[1]));
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(144);
  });
});
