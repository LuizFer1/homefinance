import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOR_TOKENS } from "../domain/model/tokens";

/**
 * Contraste das cores de cartão (os tokens `--color-tag-*`) nos dois temas.
 *
 * A barra da Home pinta cada cartão com a cor que a pessoa escolheu, em cima do
 * card (`surface`). É um elemento gráfico,
 * não texto: o piso é o 3:1 do WCAG 1.4.11. Os valores saem do `app.css` de
 * verdade — um teste com cópia das cores não pegaria uma cor retocada lá.
 */
const CSS = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");

/** Corpo do primeiro bloco `{ ... }` que começa em `opener`. */
function block(opener: string): string {
  const start = CSS.indexOf(opener);
  if (start === -1) throw new Error(`bloco não encontrado: ${opener}`);
  let depth = 0;
  for (let i = CSS.indexOf("{", start); i < CSS.length; i += 1) {
    if (CSS[i] === "{") depth += 1;
    if (CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(CSS.indexOf("{", start) + 1, i);
    }
  }
  throw new Error(`bloco sem fim: ${opener}`);
}

function vars(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    out[match[1] as string] = (match[2] as string).trim();
  }
  return out;
}

type Rgb = [number, number, number];

function srgbEncode(linear: number): number {
  const v = Math.min(1, Math.max(0, linear));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** oklch(L C H) → sRGB linear, pela matriz do OKLab. */
function oklchToLinear(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function hexToLinear(hex: string): Rgb {
  const n = hex.replace("#", "");
  const channel = (i: number) => {
    const v = Number.parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(2), channel(4)];
}

/** Luminância relativa WCAG; o canal sai do gamut para o recorte, como o navegador faz. */
function luminance(value: string): number {
  let linear: Rgb;
  const oklch = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (oklch) {
    linear = oklchToLinear(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
  } else if (/^#[0-9a-f]{6}$/i.test(value)) {
    linear = hexToLinear(value);
  } else {
    throw new Error(`formato de cor não suportado: ${value}`);
  }
  const [r, g, b] = linear.map((v) => {
    const encoded = srgbEncode(v);
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = {
  claro: vars(block("@theme static")),
  escuro: vars(block('[data-theme="hf-dark"]')),
  // O escuro do sistema é outra cópia do bloco: tem de dizer o mesmo.
  "escuro do sistema": vars(block(':root:not([data-theme="hf-light"])')),
} as const;

const MIN_GRAPHIC_CONTRAST = 3;
const MIN_TRACK_CONTRAST = 2.5;

describe("contraste das cores de cartão", () => {
  it("o parser enxerga as doze cores e as bases nos três blocos", () => {
    for (const theme of Object.values(THEMES)) {
      for (const token of COLOR_TOKENS) expect(theme[`tag-${token}`]).toBeDefined();
      expect(theme.surface).toBeDefined();
      expect(theme["neutral-800"]).toBeDefined();
    }
  });

  it("o escuro do sistema repete o escuro explícito", () => {
    for (const token of COLOR_TOKENS) {
      expect(THEMES["escuro do sistema"][`tag-${token}`]).toBe(THEMES.escuro[`tag-${token}`]);
    }
  });

  for (const [name, theme] of Object.entries(THEMES)) {
    describe(`tema ${name}`, () => {
      for (const token of COLOR_TOKENS) {
        it(`${token} tem ao menos 3:1 sobre o card`, () => {
          const color = theme[`tag-${token}`] as string;
          expect(
            contrast(color, theme.surface as string),
            `${token} sobre surface`,
          ).toBeGreaterThanOrEqual(MIN_GRAPHIC_CONTRAST);
        });

        // A barra com cartões não pinta trilho (os vãos são o próprio card), então 3:1 vale
        // sobre `surface`. Sobre o trilho cinza do tema claro algumas cores ficam em 2,7–3,0:
        // o piso abaixo só barra uma regressão, e o número vai no relatório da tarefa.
        it(`${token} não afunda no trilho cinza`, () => {
          const color = theme[`tag-${token}`] as string;
          expect(
            contrast(color, theme["neutral-800"] as string),
            `${token} sobre neutral-800`,
          ).toBeGreaterThanOrEqual(MIN_TRACK_CONTRAST);
        });
      }
    });
  }
});
