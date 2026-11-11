import type { BudgetLevel, BudgetStatus } from "../../domain/budgets/status";
import type { CategoryShare } from "../../domain/projections/insights";
import { brl } from "../ui/money";
import { IconTile } from "../ui/tile";

/** Uma categoria do mês com a meta dela, quando existe. */
export interface CategoryRow extends CategoryShare {
  budget: BudgetStatus | null;
}

/** Linhas sempre visíveis no bloco; o resto fica atrás de "Ver todas". */
export const TOP_CATEGORIES = 5;

/**
 * Junta o gasto por categoria com as metas. As duas projeções somam do mesmo
 * jeito (ver `budgetReport`), então o valor da linha e o uso da meta não
 * discordam. "Sem categoria" (`id` nulo) nunca tem meta.
 */
export function withBudgets(categories: CategoryShare[], budgets: BudgetStatus[]): CategoryRow[] {
  const byCategory = new Map(budgets.map((row) => [row.category.id, row]));
  return categories.map((row) => ({
    ...row,
    budget: row.id === null ? null : (byCategory.get(row.id) ?? null),
  }));
}

/**
 * As maiores, mais as que estão fora delas com meta em atenção ou estourada:
 * uma categoria pequena que passou do limite é justamente o que a tela não
 * pode esconder atrás de um toque.
 */
export function visibleRows(rows: CategoryRow[]): CategoryRow[] {
  return rows.filter(
    (row, index) => index < TOP_CATEGORIES || (row.budget !== null && row.budget.level !== "ok"),
  );
}

/** Uma cor só para todas: o tile já identifica a categoria; a cor da barra é estado. */
const FILL: Record<BudgetLevel, string> = {
  ok: "bg-neutral-500",
  warning: "bg-tag-amber",
  over: "bg-expense",
};

/**
 * Categorias do mês, com a meta fundida na linha.
 *
 * Todas as barras dividem **uma** escala — o maior gasto ou o maior limite
 * entre as linhas mostradas —, senão o traço do limite de uma linha não seria
 * comparável ao da outra e a barra viraria só um enfeite de porcentagem.
 *
 * Com meta, a barra é um `progressbar` com o mesmo texto da `BudgetBar`: só a
 * porcentagem, nunca reais, para o leitor de tela não ler o que "Ocultar
 * valores" esconde.
 */
export function CategoryRows({ rows }: { rows: CategoryRow[] }) {
  const scale = Math.max(
    1,
    ...rows.map((row) => Math.max(row.amountMinor, row.budget?.limitMinor ?? 0)),
  );

  return (
    <ul class="space-y-3">
      {rows.map((row) => {
        const budget = row.budget;
        // `floor`, como na `BudgetBar`: 99,6% não pode ser lido como meta atingida.
        const used = budget === null ? 0 : Math.floor(budget.usedRatio * 100);
        return (
          <li key={row.id ?? "sem-categoria"} data-testid={`category-row-${row.id ?? "none"}`}>
            <div class="flex items-center gap-3">
              <IconTile icon={row.icon} color={row.color} size={28} iconSize={16} />
              <span class="min-w-0 flex-1 truncate text-sm">{row.name}</span>
              <span class="hf-num text-sm font-medium">{brl(row.amountMinor)}</span>
            </div>
            <div class="mt-1 ml-10 flex items-center gap-3">
              <div
                class="relative h-3 min-w-0 flex-1"
                {...(budget === null
                  ? { "aria-hidden": true }
                  : {
                      role: "progressbar",
                      "aria-label": `Meta de ${row.name}`,
                      "aria-valuemin": 0,
                      "aria-valuemax": 100,
                      "aria-valuenow": Math.min(100, used),
                      "aria-valuetext":
                        budget.level === "over"
                          ? `Meta estourada: ${used}% usado`
                          : `${used}% da meta usada`,
                    })}
              >
                <div class="absolute inset-x-0 top-1 h-1 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    data-testid="category-fill"
                    class={`h-full rounded-full ${FILL[budget?.level ?? "ok"]}`}
                    // Piso de 2%: uma categoria pequena ao lado de uma grande sumiria da barra.
                    style={{ width: `${Math.max(2, (row.amountMinor / scale) * 100)}%` }}
                  />
                </div>
                {budget !== null && (
                  <span
                    data-testid="category-limit"
                    aria-hidden="true"
                    class="absolute inset-y-0 -translate-x-1/2 border-l-2 border-dotted border-fg/80"
                    style={{ left: `${(budget.limitMinor / scale) * 100}%` }}
                  />
                )}
              </div>
              {/* Largura fixa: com legendas de tamanhos diferentes as barras perderiam a escala comum. */}
              <span
                class={`hf-num w-24 shrink-0 text-right text-xs ${
                  budget?.level === "over" ? "text-expense-fg" : "text-fg/55"
                }`}
              >
                {budget === null ? `${Math.round(row.share * 100)}%` : `${used}% da meta`}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
