const CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata centavos para exibição. A divisão por 100 é só de apresentação. */
export function formatBRL(minor: number): string {
  return CURRENCY.format(minor / 100);
}
