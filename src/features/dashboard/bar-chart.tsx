import { formatBRL } from "../../domain/money/money";
import type { MonthTotals } from "../../domain/projections/breakdown";
import { monthLabelShort } from "../../domain/projections/periods";

export interface BarChartProps {
  /** Do mais antigo para o mais novo; o último é o mês escolhido. */
  data: MonthTotals[];
}

/**
 * Receita × despesa em pares de barras de 10px, seis meses.
 *
 * Os meses anteriores ficam a 55%: o olho vai primeiro para o mês escolhido, e
 * os outros viram contexto. A escala é o maior valor da janela, em receita ou
 * despesa, para os dois lados serem comparáveis.
 */
export function BarChart({ data }: BarChartProps) {
  const peak = Math.max(0, ...data.flatMap((item) => [item.incomeMinor, item.expenseMinor]));
  // Série toda zerada não tem escala: quem chama mostra o vazio por extenso.
  if (peak === 0) return null;
  // Porcentagem da coluna de 110px (a altura máxima do handoff).
  const height = (value: number) => `${(value / peak) * 100}%`;

  return (
    <div class="mt-4">
      <div class="flex h-[110px] items-end justify-between px-1">
        {data.map((item, index) => {
          const current = index === data.length - 1;
          return (
            <div
              key={item.month}
              class="flex h-full items-end gap-1"
              style={{ opacity: current ? 1 : 0.55 }}
            >
              <span
                data-testid={`bar-income-${item.month}`}
                title={`Receita: ${formatBRL(item.incomeMinor)}`}
                class="w-2.5 rounded-t-[3px] bg-income"
                style={{ height: height(item.incomeMinor) }}
              />
              <span
                data-testid={`bar-expense-${item.month}`}
                title={`Despesa: ${formatBRL(item.expenseMinor)}`}
                class="w-2.5 rounded-t-[3px] bg-expense"
                style={{ height: height(item.expenseMinor) }}
              />
            </div>
          );
        })}
      </div>
      <div class="hf-rule-both mt-0" aria-hidden="true" />
      <div class="mt-2 flex justify-between px-1 text-[11px] text-fg/50">
        {data.map((item, index) => (
          <span
            key={item.month}
            class={`w-6 text-center ${index === data.length - 1 ? "font-medium text-fg/80" : ""}`}
          >
            {monthLabelShort(item.month)}
          </span>
        ))}
      </div>
    </div>
  );
}
