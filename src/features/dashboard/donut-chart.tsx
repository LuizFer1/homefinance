import { formatBRL } from "../../domain/money/money";
import type { CategorySlice } from "../../domain/projections/breakdown";
import { cssVarForToken } from "../colors/color-token";

export interface DonutChartProps {
  /**
   * Já ordenadas por valor decrescente, e todas com valor não negativo.
   *
   * Valor negativo não é rejeitado aqui: ele desapareceria da tela (o `dash`
   * trava em zero) mas ainda deslocaria as fatias seguintes, corrompendo o
   * desenho em silêncio. Quem monta as fatias é que garante o sinal.
   */
  slices: CategorySlice[];
  /** Legenda sob o valor central, ex. "no mês". */
  caption: string;
}

/**
 * Raio escolhido para a circunferência dar exatamente 100 (2·pi·r = 100).
 *
 * É isso, e só isso, que faz `stroke-dasharray` ser a própria porcentagem da
 * fatia. Mexer neste número sem refazer a conta transforma cada fatia num valor
 * arbitrário e exige trigonometria de volta.
 */
const RADIUS = 15.915_494;

/**
 * Metade do `viewBox` de 42. Os dois números têm que concordar: mudar um sem o
 * outro tira a rosca do centro sem nenhum teste acusar, porque o dasharray
 * continua correto.
 */
const CENTER = 21;

/** Espessura do anel. Acima de ~6 o furo do meio fecha e some o espaço do total. */
const STROKE = 5;

/** Respiro entre fatias, na mesma escala de 100. */
const GAP = 0.8;

export function DonutChart({ slices, caption }: DonutChartProps) {
  const totalMinor = slices.reduce((sum, slice) => sum + slice.amountMinor, 0);
  // Dividir por zero produziria NaN em todo dasharray e um anel invisível; quem
  // chama decide o que mostrar no lugar.
  if (totalMinor <= 0) return null;

  // Fatia única não tem vizinha de quem se separar.
  const gap = slices.length > 1 ? GAP : 0;

  let running = 0;
  const arcs = slices.map((slice) => {
    const share = (slice.amountMinor / totalMinor) * 100;
    const arc = {
      key: slice.key,
      color: slice.color,
      // Fatia menor que o respiro viraria comprimento negativo, que o SVG
      // desenha como traço cheio — o oposto do pretendido.
      dash: Math.max(0, share - gap),
      offset: -running,
    };
    running += share;
    return arc;
  });

  return (
    <div class="flex items-center gap-4">
      <div class="relative size-34 shrink-0">
        {/* A legenda ao lado já é a leitura acessível; repetir aqui faria o
            leitor de tela ler os mesmos valores duas vezes. */}
        <svg viewBox="0 0 42 42" class="size-full -rotate-90" aria-hidden="true">
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={cssVarForToken(arc.color)}
              stroke-width={STROKE}
              stroke-dasharray={`${arc.dash} ${100 - arc.dash}`}
              stroke-dashoffset={arc.offset}
            />
          ))}
        </svg>

        {/* O total vai em HTML sobreposto, e não em <text>: SVG não quebra
            linha e não acompanha o rem de quem aumentou a fonte do sistema. */}
        <div class="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span class="hf-num text-sm font-semibold">{formatBRL(totalMinor)}</span>
          <span class="mt-0.5 text-[0.625rem] text-base-content/45">{caption}</span>
        </div>
      </div>

      <ul class="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.key} class="flex items-center gap-2 text-sm">
            <span
              class="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: cssVarForToken(slice.color) }}
            />
            <span class="min-w-0 flex-1 truncate text-base-content/70">{slice.name}</span>
            <span class="hf-num shrink-0 font-medium">{formatBRL(slice.amountMinor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
