import { dayOfMonthClamped } from "../dates/business-day";
import { shiftMonth } from "../dates/calendar";
import type { RecurrenceRule } from "../model/recurrence";

/** Maior parcelamento aceito: o mesmo teto da importação de PDF. */
export const MAX_INSTALLMENTS = 48;
export const MIN_INSTALLMENTS = 2;

export interface InstallmentSplit {
  /** Valor de cada parcela a partir da 2ª. */
  amountMinor: number;
  /** Valor da 1ª: a base mais os centavos que a divisão não distribui. */
  firstAmountMinor: number;
}

/**
 * Divide o total como os bancos fazem: a sobra fica na 1ª parcela, então a soma
 * bate com o que o usuário digitou. R$ 100 em 3x = 33,34 + 33,33 + 33,33.
 *
 * Parcela de zero centavo não existe: com total menor que o número de vezes
 * (ou fora de 2..48) é erro de quem chamou, não algo a arredondar em silêncio.
 */
export function splitInstallments(totalMinor: number, count: number): InstallmentSplit {
  if (
    !Number.isSafeInteger(totalMinor) ||
    !Number.isInteger(count) ||
    count < MIN_INSTALLMENTS ||
    count > MAX_INSTALLMENTS ||
    totalMinor < count
  ) {
    throw new Error("Parcelamento inválido");
  }
  const amountMinor = Math.floor(totalMinor / count);
  return { amountMinor, firstAmountMinor: amountMinor + (totalMinor % count) };
}

/** Quantas vezes o total admite: cada parcela precisa de pelo menos um centavo. */
export function maxInstallmentsFor(totalMinor: number): number {
  return Math.max(MIN_INSTALLMENTS, Math.min(MAX_INSTALLMENTS, Math.trunc(totalMinor)));
}

/**
 * Série mensal no dia da compra, terminando na n-ésima parcela. A data final é
 * a da última parcela já limitada ao mês curto (compra no dia 31 termina em 28
 * de fevereiro, se for o caso): uma data final no dia 31 de um mês de 30 dias
 * não muda nada, mas no dia 30 de um mês de 31 cortaria a parcela daquele mês.
 */
export function installmentRule(firstOn: string, count: number): RecurrenceRule {
  const day = Number(firstOn.slice(8, 10)) || 1;
  return {
    frequency: "monthly",
    scheduleType: "dayOfMonth",
    scheduleN: day,
    endOn: dayOfMonthClamped(shiftMonth(firstOn.slice(0, 7), count - 1), day),
    variable: false,
  };
}

/** Sufixo da descrição da série, o mesmo da importação de PDF: "Loja (3x)". */
export function installmentDescription(description: string, count: number): string {
  return `${description} (${count}x)`;
}
