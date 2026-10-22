import { monthGrid, WEEKDAYS } from "../../domain/dates/calendar";
import { type DailyExpenses, heatLevel } from "../../domain/projections/daily-expenses";
import { brl, shortBRL } from "../ui/money";

export interface HeatMapProps {
  month: string;
  daily: DailyExpenses;
  /** Hoje em 'YYYY-MM-DD', só para destacar a célula. */
  today: string;
  onPickDay: (date: string) => void;
}

/**
 * Porcentagem de `--color-expense` por degrau (índice = nível). O teto é 56%, e
 * não 100%: o texto da célula fica em `fg` nos dois temas, então o fundo mais
 * forte precisa deixar esse texto legível. Misturar o token com transparente
 * herda os dois temas sem hex novo.
 */
const MIX = [0, 14, 28, 42, 56] as const;

/**
 * Calendário do mês com a saída de cada dia, em passos discretos de cor.
 *
 * Passos e não gradiente contínuo: o olho lê "pouco / médio / bastante / o pior
 * dia" melhor que 30 tons parecidos. A intensidade é relativa ao maior dia do
 * mês, então um mês barato também mostra onde foi o pico.
 *
 * O valor vai em texto dentro do botão (não só a cor), e a privacidade troca só
 * o texto: a forma do mapa mostra distribuição, não quanto foi.
 */
export function HeatMap({ month, daily, today, onPickDay }: HeatMapProps) {
  const cells = monthGrid(month);
  // Corta as semanas finais que seriam só preenchimento do mês seguinte.
  const lastIn = cells.map((cell) => cell.inMonth).lastIndexOf(true);
  const shown = cells.slice(0, Math.ceil((lastIn + 1) / 7) * 7);

  return (
    <div class="mt-3">
      <div aria-hidden="true" class="grid grid-cols-7 gap-1 text-center text-[11px] text-fg/50">
        {WEEKDAYS.map((letter, index) => (
          <span key={index}>{letter}</span>
        ))}
      </div>
      <div class="mt-1 grid grid-cols-7 gap-1">
        {shown.map((cell) => {
          if (!cell.inMonth) return <span key={cell.date} aria-hidden="true" />;
          const amount = daily.byDay[cell.day - 1] ?? 0;
          const level = heatLevel(amount, daily.maxMinor);
          return (
            <button
              key={cell.date}
              type="button"
              data-testid={`heat-day-${cell.day}`}
              data-level={level}
              aria-label={`Dia ${cell.day}: ${amount === 0 ? "sem saída" : `saída de ${brl(amount)}`}`}
              onClick={() => onPickDay(cell.date)}
              class={`hf-press flex aspect-square min-w-0 flex-col items-center justify-center rounded-md ${
                level === 0 ? "bg-fg/[0.05]" : ""
              } ${cell.date === today ? "outline-2 -outline-offset-2 outline-accent" : ""}`}
              style={
                level === 0
                  ? undefined
                  : {
                      backgroundColor: `color-mix(in oklch, var(--color-expense) ${MIX[level]}%, transparent)`,
                    }
              }
            >
              <span aria-hidden="true" class="hf-num text-[11px] leading-none text-fg/70">
                {cell.day}
              </span>
              <span
                aria-hidden="true"
                class="hf-num mt-0.5 max-w-full truncate text-[10px] leading-none font-medium"
              >
                {amount === 0 ? "" : shortBRL(amount)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
