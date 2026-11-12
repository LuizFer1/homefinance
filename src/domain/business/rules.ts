import { MAX_MINOR } from "../money/mask";

/** Tamanho máximo dos nomes de bem e dívida e do credor: o mesmo limite no campo e na store. */
export const MAX_NAME = 60;

/** 'YYYY-MM-DD' que existe no calendário ("2026-02-30" não passa). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  // `Date.UTC` só para a aritmética: com fuso local o dia 1º cairia no mês anterior.
  const stamp = new Date(Date.UTC(y, m - 1, d));
  return stamp.getUTCFullYear() === y && stamp.getUTCMonth() === m - 1 && stamp.getUTCDate() === d;
}

/** Valor em centavos que o campo de dinheiro consegue exibir (inteiro, positivo, até o teto). */
export function isPositiveMinor(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_MINOR;
}

/**
 * Por que o par valor original/saldo atual não vale, ou nulo. Saldo zero vale (dívida
 * quitada continua no cadastro); saldo acima do original não: não há juros calculados
 * aqui, então um saldo maior quase sempre é erro de digitação. Quem quiser registrar
 * juros e multa atualiza o valor original.
 */
export function debtAmountsProblem(principalMinor: number, balanceMinor: number): string | null {
  if (!isPositiveMinor(principalMinor)) return "Informe o valor original da dívida.";
  if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 0 || balanceMinor > MAX_MINOR) {
    return "Informe o saldo atual (zero se já quitou).";
  }
  if (balanceMinor > principalMinor) {
    return "O saldo atual não pode ser maior que o valor original.";
  }
  return null;
}
