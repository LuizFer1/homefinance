import { describe, expect, it, vi } from "vitest";
import {
  AVATAR_MAX_CHARS,
  AVATAR_SIZE,
  type AvatarDeps,
  processAvatar,
  squareCrop,
} from "./avatar";

const FILE = new Blob(["x"], { type: "image/jpeg" });

/** Codificador falso: o tamanho do data URI cai conforme a qualidade pedida. */
function encoderDe(tamanhoPorQualidade: Record<number, number>): AvatarDeps["encode"] {
  return vi.fn(async (_source, _crop, _size, quality: number) => {
    const chars = tamanhoPorQualidade[quality] ?? 1;
    return `data:image/webp;base64,${"A".repeat(chars)}`;
  });
}

function deps(encode: AvatarDeps["encode"], width = 400, height = 300): AvatarDeps {
  return { decode: async () => ({ width, height }), encode };
}

describe("squareCrop", () => {
  it("recorta o quadrado central de uma paisagem", () => {
    expect(squareCrop(400, 300)).toEqual({ x: 50, y: 0, size: 300 });
  });

  it("recorta o quadrado central de um retrato", () => {
    expect(squareCrop(300, 400)).toEqual({ x: 0, y: 50, size: 300 });
  });

  it("nao recorta nada de uma imagem ja quadrada", () => {
    expect(squareCrop(300, 300)).toEqual({ x: 0, y: 0, size: 300 });
  });

  it("arredonda a sobra impar em vez de devolver meio pixel", () => {
    expect(squareCrop(301, 300)).toEqual({ x: 1, y: 0, size: 300 });
  });
});

describe("processAvatar", () => {
  it("aceita na primeira qualidade quando ja cabe", async () => {
    const encode = encoderDe({ 0.8: 100 });

    const uri = await processAvatar(FILE, deps(encode));

    expect(uri.startsWith("data:image/webp;base64,")).toBe(true);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("baixa a qualidade ate caber no teto", async () => {
    // Uma foto de 12MP nao cabe em 6kb no primeiro chute. Sem o laco, "escolher
    // a foto errada" viraria erro do usuario em vez de trabalho do app.
    const encode = encoderDe({ 0.8: 99_999, 0.6: 99_999, 0.45: 100 });

    const uri = await processAvatar(FILE, deps(encode));

    expect(uri.length).toBeLessThanOrEqual(AVATAR_MAX_CHARS);
    expect(encode).toHaveBeenCalledTimes(3);
  });

  it("para na primeira qualidade que cabe, sem tentar as piores", async () => {
    const encode = encoderDe({ 0.8: 99_999, 0.6: 100, 0.45: 10 });

    await processAvatar(FILE, deps(encode));

    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("rejeita quando nem a menor qualidade cabe, sem devolver nada gravavel", async () => {
    // Melhor ficar sem foto do que inchar a linha do perfil, que viaja inteira
    // em todo sync.
    const encode = encoderDe({ 0.8: 99_999, 0.6: 99_999, 0.45: 99_999 });

    await expect(processAvatar(FILE, deps(encode))).rejects.toThrow(/grande demais/i);
  });

  it("aceita exatamente no teto, sem margem inventada", () => {
    const encode = encoderDe({ 0.8: AVATAR_MAX_CHARS - "data:image/webp;base64,".length });

    return expect(processAvatar(FILE, deps(encode))).resolves.toHaveLength(AVATAR_MAX_CHARS);
  });

  it("pede o recorte quadrado central e o tamanho final ao codificador", async () => {
    const encode = encoderDe({ 0.8: 100 });

    await processAvatar(FILE, deps(encode, 400, 300));

    expect(encode).toHaveBeenCalledWith(
      { width: 400, height: 300 },
      { x: 50, y: 0, size: 300 },
      AVATAR_SIZE,
      0.8,
    );
  });

  it("decodifica uma vez so, mesmo tentando tres qualidades", async () => {
    const decode = vi.fn(async () => ({ width: 400, height: 300 }));
    const encode = encoderDe({ 0.8: 99_999, 0.6: 99_999, 0.45: 100 });

    await processAvatar(FILE, { decode, encode });

    expect(decode).toHaveBeenCalledTimes(1);
  });
});
