/**
 * Aritmética do reajuste. O percentual é só forma de entrada: o que se grava é
 * o valor em centavos, e é aqui que um vira o outro.
 */

/**
 * Base mais `percent`%, em centavos inteiros.
 *
 * Multiplica por `100 + percent` antes de dividir, e não por `1 + percent/100`:
 * `80000 * 1.12` dá 89600.00000000001 em ponto flutuante, e um resíduo desses
 * decide o arredondamento no caso de meio centavo.
 */
export function applyPercent(baseMinor: number, percent: number): number {
  return Math.round((baseMinor * (100 + percent)) / 100);
}

/** Variação percentual de `baseMinor` para `nextMinor`. Base zero não tem variação. */
export function percentChange(baseMinor: number, nextMinor: number): number {
  return baseMinor === 0 ? 0 : (nextMinor / baseMinor - 1) * 100;
}

const PERCENT_INPUT = /^[+-]?\d+(?:[.,]\d+)?$/;

/** "12", "12,5", "-10", "+3.25" viram número; qualquer outra coisa, null. */
export function parsePercent(text: string): number | null {
  const trimmed = text.trim();
  if (!PERCENT_INPUT.test(trimmed)) return null;
  return Number(trimmed.replace(",", "."));
}

const PERCENT_FORMAT = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

/** 16,666… vira "+16,67%"; -10 vira "-10%". */
export function formatPercent(percent: number): string {
  return `${PERCENT_FORMAT.format(percent)}%`;
}
