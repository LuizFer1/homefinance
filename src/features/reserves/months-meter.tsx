import { meterFractions } from "../../domain/reserves/goals";

export interface MonthsMeterProps {
  /** Meses cobertos agora (já sem a parte removida). */
  months: number;
  /** Meses que uma retirada em edição tiraria; desenhados na cor de despesa. */
  removedMonths?: number;
  height: 8 | 10 | 14;
  /** Estado vazio (2f): só o contorno, sem preenchimento. */
  dashed?: boolean;
}

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/**
 * Seis segmentos, um por mês de cobertura. Decorativo: o texto "Cobre 3,9 meses"
 * ao lado é o que o leitor de tela lê, então a grade inteira sai da árvore.
 */
export function MonthsMeter({
  months,
  removedMonths = 0,
  height,
  dashed = false,
}: MonthsMeterProps) {
  const kept = meterFractions(months);
  // O removido de cada segmento é a diferença entre cobrir (meses + removido) e cobrir
  // meses; calcular por segmento evita a parte removida vazar para o vizinho.
  const total = meterFractions(months + removedMonths);

  return (
    <div class="grid grid-cols-6 gap-1" aria-hidden="true">
      {kept.map((fraction, i) => {
        const removed = Math.max(0, (total[i] ?? 0) - fraction);
        return (
          <span
            key={i}
            data-segment
            class={
              dashed
                ? "relative overflow-hidden rounded-[2px] border border-dashed border-neutral-700"
                : "relative overflow-hidden rounded-[2px] bg-neutral-800"
            }
            style={{ height: `${height}px` }}
          >
            {dashed ? null : (
              <>
                <span
                  data-fill
                  class="absolute inset-y-0 left-0 bg-accent shadow-[0_0_8px_var(--color-accent)]"
                  style={{ width: pct(fraction) }}
                />
                {removed > 0 ? (
                  <span
                    data-removed
                    class="absolute inset-y-0 bg-expense"
                    style={{ left: pct(fraction), width: pct(removed) }}
                  />
                ) : null}
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
