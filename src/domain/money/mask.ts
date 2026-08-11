/**
 * Máscara de digitação dos campos de dinheiro.
 *
 * Tudo que entra é lido como centavos, da direita para a esquerda. Não existe
 * entrada inválida a recusar porque não existe entrada inválida a fazer, e é
 * isso que remove o passo de adivinhação entre o que foi digitado e o que vai
 * para o log — que é eterno. O campo livre aceitava "12.5" e só contava que não
 * tinha entendido uma tela depois, na validação.
 */

/** Agrupa o milhar. O `Intl` já está no bundle por causa do `formatBRL`. */
const GROUPS = new Intl.NumberFormat("pt-BR");

/** Nove dígitos inteiros mais os dois centavos — 999.999.999,99. */
export const MAX_DIGITS = 11;

/**
 * Extrai os dígitos de qualquer texto e normaliza.
 *
 * Os zeros à esquerda somem antes do corte: mantidos, consumiriam `MAX_DIGITS`
 * com dígitos invisíveis e o campo travaria antes do teto que ele anuncia.
 *
 * `"0"` normalizar para `""` é o que faz o backspace esvaziar o campo de
 * verdade — 0,01 apagado vira o texto "0,0", que sem esta regra voltaria como
 * 0,00 e ficaria preso lá, sem tecla capaz de limpá-lo.
 *
 * O corte por `slice` recusa o dígito novo em vez de truncar o valor: o
 * caractere excedente entrou no fim do texto, então descartá-lo devolve
 * exatamente o número que já estava na tela.
 */
export function onlyDigits(input: string): string {
  return input.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
}

/** Dígitos → centavos inteiros, do jeito que o log guarda. */
export function minorOf(digits: string): number {
  return digits === "" ? 0 : Number(digits);
}

/**
 * Dígitos → texto exibido. Vazio continua vazio, para o placeholder aparecer;
 * "0,00" no campo recém-aberto não se distinguiria de um valor já digitado.
 *
 * A parte inteira e os centavos são separados por corte de string, nunca por
 * divisão: `123456789 / 100` não é representável em ponto flutuante, e a
 * aritmética de dinheiro deste app é inteira em todo lugar.
 */
export function maskDigits(digits: string): string {
  if (digits === "") return "";

  const padded = digits.padStart(3, "0");
  return `${GROUPS.format(Number(padded.slice(0, -2)))},${padded.slice(-2)}`;
}
