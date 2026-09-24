/*
 * A aritmética de dia mora em `domain/dates/calendar.ts` — havia uma cópia
 * privada dela aqui, e duas cópias da regra de bissexto são uma a mais.
 */
import { shiftDay } from "../dates/calendar";

/**
 * Mês é manipulado como o prefixo 'YYYY-MM' da própria string de data, nunca
 * por `Date`.
 *
 * `new Date("2026-08-01")` é interpretado como UTC; no fuso do Brasil isso vira
 * 31/07 às 21h e todo dia 1º cairia no mês anterior — um bug que só aparece um
 * dia por mês e some na máquina de quem programa em UTC. String não tem fuso.
 *
 * `Intl.DateTimeFormat` também fica de fora pelo mesmo motivo: ele precisa de um
 * `Date` para formatar, e o `Date` traz o problema de volta.
 */

const LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

const SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

/** 'YYYY-MM-DD' para 'YYYY-MM'. */
export function monthOf(occurredOn: string): string {
  return occurredOn.slice(0, 7);
}

/**
 * Os `count` meses terminando no mês de `today`, do mais antigo para o mais novo.
 *
 * O decremento acontece num índice absoluto de meses (`ano * 12 + mês`), e não
 * subtraindo do número do mês: subtrair quebra na virada de ano, quando janeiro
 * menos um dá zero.
 */
export function lastMonths(today: string, count: number): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const current = year * 12 + (month - 1);
  const months: string[] = [];

  for (let back = count - 1; back >= 0; back--) {
    const index = current - back;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    months.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
  }

  return months;
}

/**
 * `noUncheckedIndexedAccess` faz o acesso por índice devolver `string |
 * undefined`. Mês fora de 1..12 só chega aqui com dado corrompido vindo do log,
 * e a tela prefere um rótulo vazio a quebrar o render inteiro.
 */
function labelFrom(table: readonly string[], month: string): string {
  return table[Number(month.slice(5, 7)) - 1] ?? "";
}

export function monthLabelShort(month: string): string {
  return labelFrom(SHORT, month);
}

export function monthLabelLong(month: string): string {
  const name = labelFrom(LONG, month);
  return name === "" ? "" : `${name} de ${month.slice(0, 4)}`;
}

/**
 * Rótulo do cabeçalho de dia, relativo a `today`.
 *
 * "Hoje" e "Ontem" existem porque são os dois dias que o usuário reconhece sem
 * ler a data. Do antepenúltimo em diante o nome do dia da semana já não ajuda —
 * "terça" pode ser qualquer terça —, então volta a data por extenso.
 *
 * O ano só aparece quando difere do ano corrente: repeti-lo em toda linha de um
 * extrato do mês seria ruído constante.
 */
export function dayLabel(occurredOn: string, today: string): string {
  if (occurredOn === today) return "Hoje";
  if (occurredOn === shiftDay(today, -1)) return "Ontem";

  const name = labelFrom(LONG, occurredOn);
  // Data corrompida vinda do log prefere aparecer crua a derrubar o render.
  if (name === "") return occurredOn;

  const day = occurredOn.slice(8, 10);
  const year = occurredOn.slice(0, 4);
  return year === today.slice(0, 4) ? `${day} de ${name}` : `${day} de ${name} de ${year}`;
}

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/**
 * Dia da semana abreviado ("qui"). `Date.UTC` só para a aritmética — ver o topo
 * de `calendar.ts`: com fuso local, a meia-noite do Brasil cai no dia anterior.
 */
export function weekdayShort(date: string): string {
  const stamp = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  return WEEKDAY_SHORT[new Date(stamp).getUTCDay()] ?? "";
}

/** "qui, 24 set". O ano só entra quando difere do de `today`. */
export function shortDate(date: string, today: string): string {
  const month = labelFrom(SHORT, date);
  if (month === "") return date;
  const base = `${weekdayShort(date)}, ${Number(date.slice(8, 10))} ${month}`;
  return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${date.slice(0, 4)}`;
}

/** "24 out" — chip de "Próximas vezes". */
export function dayMonth(date: string): string {
  return `${Number(date.slice(8, 10))} ${labelFrom(SHORT, date)}`;
}

/**
 * Cabeçalho do grupo do dia: "Hoje · qui, 24 set", "Ontem · qua, 23 set",
 * "Seg, 21 set". O relativo vem primeiro porque é o que se reconhece sem ler.
 */
export function dayHeading(date: string, today: string): string {
  const short = shortDate(date, today);
  if (date === today) return `Hoje · ${short}`;
  if (date === shiftDay(today, -1)) return `Ontem · ${short}`;
  return short.charAt(0).toLocaleUpperCase("pt-BR") + short.slice(1);
}

/** Dias corridos de `from` até `to` (positivo quando `to` é depois). */
export function daysBetween(from: string, to: string): number {
  const stamp = (date: string) =>
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Math.round((stamp(to) - stamp(from)) / 86_400_000);
}
