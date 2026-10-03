import { monthLabelLong, monthLabelShort } from "../../domain/projections/periods";

/** "jul 2027"; no ano de `today`, só "dez" (como no handoff). */
export function deadlineLabel(deadline: string, today: string): string {
  const name = monthLabelShort(deadline);
  return deadline.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${deadline.slice(0, 4)}`;
}

/** Dia do mês de uma data 'YYYY-MM-DD' (o `day` da regra mensal nasce daqui). */
export function dayOfDate(date: string): number {
  return Number(date.slice(8, 10));
}

/** "6 set" — linha de autor do movimento. */
export function movementDateLabel(date: string): string {
  return `${dayOfDate(date)} ${monthLabelShort(date)}`;
}

/** Nome do mês sozinho, minúsculo ("setembro"): é como o handoff o escreve nas linhas. */
export function monthName(month: string): string {
  return monthLabelLong(month).split(" ")[0]?.toLocaleLowerCase("pt-BR") ?? "";
}
