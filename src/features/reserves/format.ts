import { monthLabelShort } from "../../domain/projections/periods";

/** "jul 2027"; no ano de `today`, só "dez" (como no handoff). */
export function deadlineLabel(deadline: string, today: string): string {
  const name = monthLabelShort(deadline);
  return deadline.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${deadline.slice(0, 4)}`;
}

/** "6 set" — linha de autor do movimento. */
export function movementDateLabel(date: string): string {
  return `${Number(date.slice(8, 10))} ${monthLabelShort(date)}`;
}
