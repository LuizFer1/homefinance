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
 * Dia anterior a uma data 'YYYY-MM-DD'.
 *
 * `Date.UTC` recebe **números**, não a string — ele não passa pelo parser que o
 * comentário do topo deste arquivo condena. E UTC não tem horário de verão,
 * então subtrair 24h é sempre exatamente um dia, inclusive na virada de mês,
 * ano e em anos bissextos. Fazer a conta à mão exigiria uma segunda cópia da
 * tabela de dias por mês e da regra de bissexto que `entities.ts` já carrega.
 */
function previousDay(date: string): string {
  const stamp =
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) -
    86_400_000;
  const previous = new Date(stamp);

  const year = String(previous.getUTCFullYear()).padStart(4, "0");
  const month = String(previous.getUTCMonth() + 1).padStart(2, "0");
  const day = String(previous.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  if (occurredOn === previousDay(today)) return "Ontem";

  const name = labelFrom(LONG, occurredOn);
  // Data corrompida vinda do log prefere aparecer crua a derrubar o render.
  if (name === "") return occurredOn;

  const day = occurredOn.slice(8, 10);
  const year = occurredOn.slice(0, 4);
  return year === today.slice(0, 4) ? `${day} de ${name}` : `${day} de ${name} de ${year}`;
}
