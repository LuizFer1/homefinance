import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(path.join(process.cwd(), ...parts), "utf8");

/** `--color-x: valor;` de um trecho de CSS, na ordem em que aparecem. */
function tokens(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)) {
    if (name && value && !out.has(name)) out.set(name, value.trim());
  }
  return out;
}

/*
 * A landing copia as cores do tema escuro em vez de importar app.css, que traz o
 * Tailwind inteiro. Copia sem conferencia desalinha em silencio no proximo
 * ajuste de paleta — a vitrine passaria a mostrar uma cor que o app nao tem.
 */
it("toda cor da landing e a mesma do tema escuro do app", () => {
  const app = read("src", "styles", "app.css");
  const darkBlock = app.slice(app.indexOf('[data-theme="hf-dark"]'));
  const dark = tokens(darkBlock);
  const landing = tokens(read("src", "landing", "landing.css"));

  expect(landing.size).toBeGreaterThan(0);
  for (const [name, value] of landing) {
    expect(dark.get(name), name).toBe(value);
  }
});
