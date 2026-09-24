import { shiftDay } from "./calendar";

/**
 * Dia útil = segunda a sexta.
 *
 * Feriados nacionais ficam de fora de propósito nesta fatia: a tabela muda todo
 * ano e não pode morar hard-coded sem virar manutenção permanente. "5º dia útil"
 * no produto significa o 5º dia de semana do mês — o mesmo que a maioria dos
 * apps financeiros faz sem calendário oficial.
 */

function utcWeekday(date: string): number {
  return new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))),
  ).getUTCDay();
}

export function isBusinessDay(date: string): boolean {
  const day = utcWeekday(date);
  return day !== 0 && day !== 6;
}

/** Último dia civil do mês `YYYY-MM`, como ISO. */
export function lastDayOfMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  // Dia 0 do mês seguinte = último dia deste.
  const stamp = Date.UTC(year, monthIndex + 1, 0);
  const moment = new Date(stamp);
  const day = String(moment.getUTCDate()).padStart(2, "0");
  return `${month}-${day}`;
}

/**
 * Dia civil `n` do mês, limitado ao último dia quando o mês é mais curto.
 * `n` inválido (≤0) cai no dia 1 — o formulário não deveria mandar isso, mas o
 * sync pode trazer lixo de versão futura e a materialização não pode explodir.
 */
export function dayOfMonthClamped(month: string, n: number): string {
  const last = lastDayOfMonth(month);
  const lastN = Number(last.slice(8, 10));
  const day = Math.min(Math.max(1, Math.trunc(n) || 1), lastN);
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * N-ésimo dia útil do mês. Se o mês não tem N dias úteis (N absurdo), devolve
 * o último dia útil do mês — melhor gerar um lançamento no fim do mês do que
 * engolir a competência em silêncio.
 */
export function nthBusinessDayOfMonth(month: string, n: number): string {
  const target = Math.max(1, Math.trunc(n) || 1);
  const last = lastDayOfMonth(month);
  let cursor = `${month}-01`;
  let count = 0;
  let lastBiz = cursor;

  while (cursor <= last) {
    if (isBusinessDay(cursor)) {
      count += 1;
      lastBiz = cursor;
      if (count === target) return cursor;
    }
    cursor = shiftDay(cursor, 1);
  }

  return lastBiz;
}
