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
 */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, "");
  if (cleaned === "" || cleaned.includes("-")) return null;

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

  const intPart = (decimalAt >= 0 ? cleaned.slice(0, decimalAt) : cleaned).replace(/[.,]/g, "");
  const fracPart = decimalAt >= 0 ? cleaned.slice(decimalAt + 1).replace(/[.,]/g, "") : "";

  if (intPart === "" && fracPart === "") return null;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;

  const digits = fracPart.padEnd(3, "0").slice(0, 3);
  const cents = Number(intPart === "" ? "0" : intPart) * 100 + Number(digits.slice(0, 2));
  return Number(digits.charAt(2)) >= 5 ? cents + 1 : cents;
}
