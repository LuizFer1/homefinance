import { shiftMonth } from "../dates/calendar";
import { monthOf } from "../projections/periods";

/** Saldo em meses do custo essencial. Valor exato: o medidor usa este. */
export function monthsCovered(balanceMinor: number, costMinor: number): number {
  if (costMinor <= 0) return 0;
  return Math.max(0, balanceMinor) / costMinor;
}

/**
 * "3,9": uma casa, **truncada**. Arredondar 3,96 para "4,0" diria que a
 * família aguenta quatro meses quando não aguenta.
 */
export function formatMonths(months: number): string {
  const tenths = Math.floor(months * 10 + 1e-9) / 10;
  return tenths.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Seis segmentos, cada um com a fração (0..1) daquele mês coberta. */
export function meterFractions(months: number): number[] {
  return Array.from({ length: 6 }, (_, i) => Math.min(1, Math.max(0, months - i)));
}

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

export interface MonthlySuggestion {
  monthlyMinor: number;
  deposits: number;
}

/** Regra 7 do handoff: meses de mês+1 até o prazo, inclusive; prazo vencido divide por 1. */
export function suggestedMonthly(
  targetMinor: number,
  balanceMinor: number,
  deadline: string,
  today: string,
): MonthlySuggestion | null {
  const missing = targetMinor - balanceMinor;
  if (missing <= 0) return null;
  const deposits = Math.max(1, monthIndex(deadline) - monthIndex(monthOf(today)));
  return { monthlyMinor: Math.ceil(missing / deposits), deposits };
}

/** Regra 8: mês atual + ceil(falta / depósito mensal). 'YYYY-MM' ou null. */
export function projectedCompletion(
  targetMinor: number,
  balanceMinor: number,
  monthlyMinor: number | null,
  today: string,
): string | null {
  const missing = targetMinor - balanceMinor;
  if (missing <= 0 || monthlyMinor === null || monthlyMinor <= 0) return null;
  return shiftMonth(monthOf(today), Math.ceil(missing / monthlyMinor));
}
