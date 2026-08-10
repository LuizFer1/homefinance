import { formatBRL } from "../../domain/money/money";
import type { MonthTotals } from "../../domain/projections/breakdown";
import { monthLabelShort } from "../../domain/projections/periods";

export interface BarChartProps {
  /**
   * Uma entrada por mês, do mais antigo para o mais novo, já com zero-fill.
   *
   * Os valores são não negativos. Negativo não é rejeitado aqui: ele viraria
   * uma altura percentual negativa, que o CSS descarta como inválida, e a barra
   * sumiria sem erro nenhum. Quem monta a série é que garante o sinal.
   */
  data: MonthTotals[];
}

/**
 * Barras em div com altura percentual, não em SVG.
 *
 * SVG exigiria um espaço de coordenadas para eixo e grade que esta tela não
 * tem, e o rótulo do mês em <text> não acompanharia o rem de quem aumentou a
 * fonte do sistema.
 */
export function BarChart({ data }: BarChartProps) {
  const peak = data.reduce((max, item) => Math.max(max, item.incomeMinor, item.expenseMinor), 0);
  // Sem pico não há escala, e toda altura viraria NaN%.
  if (peak <= 0) return null;

  return (
    <div>
      <div
        class="flex items-center justify-end gap-4 text-[0.6875rem] text-base-content/55"
        aria-hidden="true"
      >
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-success" />
          Receita
        </span>
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-error" />
          Despesa
        </span>
      </div>

      {/*
        Barras e rótulo na MESMA coluna, num `map` só.

        Em duas linhas flex irmãs cada uma calculava a própria largura de coluna,
        e um filho flex não encolhe abaixo do conteúdo dele: com meses demais numa
        tela estreita, a linha das barras e a dos rótulos convergiam para larguras
        diferentes e o rótulo saía de baixo da própria barra. Com uma coluna só,
        as duas coisas compartilham a largura por construção.

        O desenho é decorativo para quem não enxerga; a leitura vem do resumo
        abaixo, que diz os mesmos números por extenso.
      */}
      <div class="mt-3 flex gap-2" aria-hidden="true">
        {data.map((item) => (
          <div key={item.month} class="flex flex-1 flex-col gap-2">
            {/*
              Largura em fração da coluna, e não em pixels fixos: com largura
              fixa o par de barras encolhe em relação ao vão a cada mês a mais
              na série, e o gráfico vira fiapos separados por espaço vazio.
            */}
            <div class="flex h-28 items-end justify-center gap-1">
              <div
                data-testid={`bar-income-${item.month}`}
                class="w-1/3 rounded-t-sm bg-success"
                style={{ height: `${(item.incomeMinor / peak) * 100}%` }}
              />
              <div
                data-testid={`bar-expense-${item.month}`}
                class="w-1/3 rounded-t-sm bg-error"
                style={{ height: `${(item.expenseMinor / peak) * 100}%` }}
              />
            </div>
            <div class="text-center text-[0.6875rem] text-base-content/45">
              {monthLabelShort(item.month)}
            </div>
          </div>
        ))}
      </div>

      <p class="sr-only">
        {data
          .map(
            (item) =>
              `${monthLabelShort(item.month)}: receita ${formatBRL(item.incomeMinor)}, ` +
              `despesa ${formatBRL(item.expenseMinor)}.`,
          )
          .join(" ")}
      </p>
    </div>
  );
}
