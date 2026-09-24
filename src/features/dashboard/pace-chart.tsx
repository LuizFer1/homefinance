import type { SpendingPace } from "../../domain/projections/insights";

export interface PaceChartProps {
  pace: SpendingPace;
  /** Mostra a régua vertical de "hoje" (só no mês corrente). */
  showToday: boolean;
  /** Rótulo curto do mês ("set"), para o eixo "1 set". */
  monthShort: string;
}

const W = 318;
const H = 124;
const PAD_X = 4;
const PAD_TOP = 10;
const PAD_BOTTOM = 6;

/**
 * Gasto acumulado por dia: o mês escolhido em linha cheia de acento com área,
 * o anterior tracejado no mês inteiro.
 *
 * Acumulado e não diário: o diário é serrilhado (aluguel num dia, nada no
 * outro) e esconde a pergunta que o card responde — "estou gastando mais rápido
 * que no mês passado?". A linha acumulada responde olhando só a inclinação.
 *
 * SVG à mão, sem biblioteca de gráfico: são duas polilinhas, e qualquer
 * biblioteca custaria mais que o app inteiro no teto de bundle.
 */
export function PaceChart({ pace, showToday, monthShort }: PaceChartProps) {
  const days = pace.current.length;
  const shown = pace.current.slice(0, Math.max(pace.cutoff, 1));
  const max = Math.max(1, ...shown, ...pace.previous);
  const x = (day: number) => PAD_X + ((day - 1) / Math.max(days - 1, 1)) * (W - 2 * PAD_X);
  const y = (value: number) => H - PAD_BOTTOM - (value / max) * (H - PAD_TOP - PAD_BOTTOM);

  const line = (values: number[]) =>
    values
      .slice(0, days)
      .map(
        (value, index) =>
          `${index === 0 ? "M" : "L"}${x(index + 1).toFixed(1)},${y(value).toFixed(1)}`,
      )
      .join(" ");

  const currentPath = line(shown);
  const lastX = x(shown.length);
  const lastY = y(shown[shown.length - 1] ?? 0);
  const area = `${currentPath} L${lastX.toFixed(1)},${H - PAD_BOTTOM} L${x(1).toFixed(1)},${H - PAD_BOTTOM} Z`;

  const ticks = [1, 10, 20].filter((day) => !showToday || Math.abs(day - pace.cutoff) > 3);

  return (
    <figure class="mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        class="h-auto w-full overflow-visible"
        role="img"
        aria-label="Gasto acumulado por dia, comparado ao mês anterior"
      >
        <path
          d={line(pace.previous)}
          fill="none"
          stroke="var(--color-neutral-600)"
          stroke-width="1.5"
          stroke-dasharray="4 4"
        />
        {pace.cutoff > 0 && (
          <>
            <path d={area} fill="color-mix(in srgb, var(--color-accent) 14%, transparent)" />
            <path
              d={currentPath}
              fill="none"
              stroke="var(--color-accent)"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </>
        )}
        {showToday && (
          <line
            x1={lastX}
            x2={lastX}
            y1={PAD_TOP - 6}
            y2={H - PAD_BOTTOM}
            stroke="var(--color-neutral-600)"
            stroke-width="1"
            stroke-dasharray="1 3"
          />
        )}
        {pace.cutoff > 0 && (
          <>
            <circle
              cx={lastX}
              cy={lastY}
              r="8"
              fill="color-mix(in srgb, var(--color-accent-200) 25%, transparent)"
            />
            <circle cx={lastX} cy={lastY} r="3.5" fill="var(--color-accent-200)" />
          </>
        )}
      </svg>
      {/* Eixo em HTML, não em <text>: herda a fonte e o tamanho sem escalar com o SVG. */}
      <div aria-hidden="true" class="relative mt-2 h-4 text-[11px] text-fg/50">
        {ticks.map((day) => (
          <span
            key={day}
            class="hf-num absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0"
            style={{ left: `${(x(day) / W) * 100}%` }}
          >
            {day === 1 ? `1 ${monthShort}` : day}
          </span>
        ))}
        {showToday && (
          <span
            class="absolute -translate-x-1/2 font-medium text-accent-300"
            style={{ left: `${(lastX / W) * 100}%` }}
          >
            hoje
          </span>
        )}
        {(!showToday || days - pace.cutoff > 3) && (
          <span class="hf-num absolute right-0">{days}</span>
        )}
      </div>
    </figure>
  );
}
