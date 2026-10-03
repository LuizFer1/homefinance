import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import { ESSENTIAL_CATEGORY_NAMES, type Reserve } from "../model/reserve";
import { lastMonths, monthOf } from "../projections/periods";
import { listTransactions } from "../projections/selectors";

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/** Ids das categorias vivas cujo nome bate com uma das cinco essenciais padrão. */
export function findEssentialCategoryIds(state: AppState): Ulid[] {
  const wanted = new Set<string>(ESSENTIAL_CATEGORY_NAMES.map(fold));
  return Object.values(state.categories)
    .filter((c) => isAlive(c) && wanted.has(fold(c.name)))
    .map((c) => c.id);
}

/**
 * Média mensal das despesas nas categorias `ids`, nos 6 meses civis antes do
 * atual. O mês corrente fica de fora: incompleto, puxaria a média para baixo
 * todo começo de mês. Com histórico curto, divide pelos meses que existem
 * desde o primeiro lançamento — dividir por 6 com dois meses de dados daria
 * um custo três vezes menor que o real.
 */
export function essentialCost(state: AppState, ids: readonly Ulid[], today: string): number | null {
  const items = listTransactions(state);
  const current = monthOf(today);
  let first: string | null = null;
  for (const t of items) {
    const m = monthOf(t.occurredOn);
    if (first === null || m < first) first = m;
  }
  if (first === null || first >= current) return null;

  const firstMonth: string = first;
  const window = lastMonths(today, 7)
    .slice(0, 6)
    .filter((m) => m >= firstMonth);
  const months = new Set(window);
  const chosen = new Set(ids);
  let sum = 0;
  for (const t of items) {
    if (t.kind !== "expense" || t.categoryId === null || !chosen.has(t.categoryId)) continue;
    if (months.has(monthOf(t.occurredOn))) sum += t.amountMinor;
  }
  return Math.round(sum / window.length);
}

export interface EmergencyGoal {
  costMinor: number;
  targetMinor: number;
}

/** Meta = custo essencial × múltiplo, recalculada a cada leitura. Sem custo útil, null. */
export function emergencyTarget(state: AppState, r: Reserve, today: string): EmergencyGoal | null {
  const cost =
    r.essentialOverrideMinor ?? essentialCost(state, r.essentialCategoryIds ?? [], today);
  if (cost === null || cost <= 0) return null;
  return { costMinor: cost, targetMinor: cost * (r.multiple ?? 6) };
}
