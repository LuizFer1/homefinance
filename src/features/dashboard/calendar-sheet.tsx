import type { DailyExpenses } from "../../domain/projections/daily-expenses";
import { monthLabelLong } from "../../domain/projections/periods";
import { wholeBRL } from "../ui/money";
import { HeatMap } from "./heat-map";
import { ListSheet } from "./list-sheet";

export interface CalendarSheetProps {
  open: boolean;
  month: string;
  daily: DailyExpenses;
  today: string;
  /** Quem chama fecha este sheet e abre o do dia: um `<dialog>` modal por vez. */
  onPickDay: (date: string) => void;
  onClose: () => void;
}

/** "Saídas por dia": os três números de apoio e o mapa de calor do mês. */
export function CalendarSheet({
  open,
  month,
  daily,
  today,
  onPickDay,
  onClose,
}: CalendarSheetProps) {
  return (
    <ListSheet open={open} title="Saídas por dia" note={monthLabelLong(month)} onClose={onClose}>
      <div class="grid grid-cols-3 gap-3">
        <div>
          <p class="text-xs text-fg/55">Média por dia</p>
          <p data-testid="heat-average" class="hf-num mt-1 text-base font-medium">
            {wholeBRL(daily.averageMinor)}
          </p>
        </div>
        <div>
          <p class="text-xs text-fg/55">Maior dia</p>
          <p data-testid="heat-peak" class="hf-num mt-1 text-base font-medium">
            {wholeBRL(daily.maxMinor)}
          </p>
          {daily.peakDay !== null && <p class="hf-num text-xs text-fg/55">dia {daily.peakDay}</p>}
        </div>
        <div>
          <p class="text-xs text-fg/55">Dias sem saída</p>
          <p data-testid="heat-empty" class="hf-num mt-1 text-base font-medium">
            {daily.emptyDays}
          </p>
        </div>
      </div>
      <HeatMap month={month} daily={daily} today={today} onPickDay={onPickDay} />
    </ListSheet>
  );
}
