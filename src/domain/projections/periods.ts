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
