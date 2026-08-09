const CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata centavos para exibição. A divisão por 100 é só de apresentação. */
export function formatBRL(minor: number): string {
  return CURRENCY.format(minor / 100);
}

/**
 * Converte texto digitado pelo usuário em centavos inteiros.
 * Devolve `null` para qualquer entrada que não seja um valor positivo reconhecível —
 * o chamador decide o que mostrar, esta função não adivinha.
 *
 * Política: só espaço em branco e o símbolo da moeda são descartados. Qualquer outro
 * caractere invalida. Descartar o que não se reconhece transformaria "−12,34" (menos
 * tipográfico) e "(12,34)" (notação contábil) em valores POSITIVOS, e o resultado iria
 * imutável para o log.
 */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/\s|R\$/gi, "");
  if (!/^[\d.,]+$/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let decimalAt = -1;

  if (lastComma >= 0 && lastDot >= 0) {
    decimalAt = Math.max(lastComma, lastDot);
  } else if (lastComma >= 0) {
    decimalAt = lastComma;
  } else if (lastDot >= 0) {
    const digitsAfter = cleaned.length - lastDot - 1;
    const looksLikeThousands = digitsAfter === 3 && lastDot > 0 && !cleaned.startsWith("0");
    decimalAt = looksLikeThousands ? -1 : lastDot;
  }

  const intSource = decimalAt >= 0 ? cleaned.slice(0, decimalAt) : cleaned;
  const fracSource = decimalAt >= 0 ? cleaned.slice(decimalAt + 1) : "";

  // A parte decimal não comporta separador; a inteira só comporta grupos de milhar de 3.
  if (!/^\d*$/.test(fracSource)) return null;
  if (!/^(\d*|\d{1,3}([.,]\d{3})+)$/.test(intSource)) return null;
  if (intSource === "" && fracSource === "") return null;

  // Truncar em 3 casas basta: o 3º dígito decide o arredondamento sozinho, e o carry
  // para a casa dos reais é automático porque `cents` é um inteiro único.
  const digits = fracSource.padEnd(3, "0").slice(0, 3);
  const reais = intSource.replace(/[.,]/g, "");
  const cents = Number(reais === "" ? "0" : reais) * 100 + Number(digits.slice(0, 2));
  return Number(digits.charAt(2)) >= 5 ? cents + 1 : cents;
}
