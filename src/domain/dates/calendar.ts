/**
 * Aritmética de calendário para a grade de dias.
 *
 * Pura e sem relógio: o "hoje" chega sempre por parâmetro, como no resto do
 * domínio. É o que mantém o teste determinístico e o que impede a grade de mudar
 * debaixo do usuário à meia-noite.
 */

const DAY_MS = 86_400_000;

/** Seis semanas. Ver `monthGrid`. */
export const CELLS = 42;

/** Iniciais da semana começando no domingo, como o calendário brasileiro. */
export const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export interface DayCell {
  /** ISO, "2026-08-10". */
  date: string;
  day: number;
  /** Falso para os dias de preenchimento vindos do mês vizinho. */
  inMonth: boolean;
}

/**
 * `Date` só para a aritmética, nunca para saber a hora.
 *
 * UTC em todos os pontos: com fuso local, somar um dia perde ou ganha uma hora
 * no horário de verão e a grade repete ou pula uma data.
 */
function toStamp(date: string): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
}

function fromStamp(stamp: number): string {
  const moment = new Date(stamp);
  const year = String(moment.getUTCFullYear()).padStart(4, "0");
  const month = String(moment.getUTCMonth() + 1).padStart(2, "0");
  const day = String(moment.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDay(date: string, delta: number): string {
  return fromStamp(toStamp(date) + delta * DAY_MS);
}

/** Anda de mês sem passar por dia: "2026-01" + 1 não pode virar 31 de fevereiro. */
export function shiftMonth(month: string, delta: number): string {
  const moment = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1),
  );
  const year = String(moment.getUTCFullYear()).padStart(4, "0");
  return `${year}-${String(moment.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Sempre seis semanas, completadas com os dias dos meses vizinhos.
 *
 * Uma grade que encolhe faz o painel pular de altura ao trocar de mês, e o botão
 * que o usuário ia clicar muda de lugar debaixo do dedo. `inMonth` é o que
 * permite à UI apagar o preenchimento sem removê-lo do fluxo.
 */
export function monthGrid(month: string): DayCell[] {
  const first = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const start = first - new Date(first).getUTCDay() * DAY_MS;

  return Array.from({ length: CELLS }, (_, index) => {
    const date = fromStamp(start + index * DAY_MS);
    return { date, day: Number(date.slice(8, 10)), inMonth: date.slice(0, 7) === month };
  });
}
