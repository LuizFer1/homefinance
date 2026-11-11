import type { MonthTotals } from "../../domain/projections/breakdown";
import { averageSurplus } from "../../domain/projections/insights";
import { wholeBRL } from "../ui/money";
import { BarChart } from "./bar-chart";
import { ListSheet } from "./list-sheet";
import { monthWord } from "./parts";

export interface HistorySheetProps {
  open: boolean;
  /** Do mais antigo para o mais novo; o último é o mês escolhido. */
  bars: MonthTotals[];
  onClose: () => void;
}

/**
 * "Últimos 6 meses": receita × despesa mês a mês e a sobra média.
 *
 * O título diz "6" e o vazio diz "seis" por extenso: os dois dependem de
 * `HISTORY_MONTHS` na página, e não dá para compor a frase a partir do número.
 */
export function HistorySheet({ open, bars, onClose }: HistorySheetProps) {
  const empty = bars.every((item) => item.incomeMinor === 0 && item.expenseMinor === 0);

  return (
    <ListSheet open={open} title="Últimos 6 meses" onClose={onClose}>
      {empty ? (
        <p class="text-sm text-fg/55">Sem movimento nos últimos seis meses</p>
      ) : (
        <>
          <p class="text-sm text-fg/70 text-pretty">
            Sobrou em média {wholeBRL(averageSurplus(bars))} por mês desde{" "}
            {monthWord(bars[0]?.month ?? "")}
          </p>
          <p class="mt-2 flex items-center gap-4 text-xs text-fg/55">
            <span class="flex items-center gap-2">
              <span aria-hidden="true" class="size-2 rounded-full bg-income" />
              receita
            </span>
            <span class="flex items-center gap-2">
              <span aria-hidden="true" class="size-2 rounded-full bg-expense" />
              despesa
            </span>
          </p>
          <BarChart data={bars} />
        </>
      )}
    </ListSheet>
  );
}
