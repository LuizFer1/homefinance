import type { ProjectionState, TransactionRecord } from "./apply";
import { NEUTRAL_TOKEN } from "./entities";
import { monthOf } from "./periods";
import { resolveCategoryName } from "./selectors";

export interface CategorySlice {
  /**
   * Chave de render, sempre única.
   *
   * Não é `Ulid | null`: "Sem categoria" e o balde "Outras" seriam ambos nulos
   * e colidiriam como `key` do Preact, fazendo as duas fatias piscarem uma
   * sobre a outra a cada refold. As duas constantes abaixo são minúsculas e um
   * ULID é maiúsculo, então não há como um id real colidir com elas.
   */
  key: string;
  name: string;
  /** Token da paleta fechada, ex. "rose". A resolução para cor mora na UI. */
  color: string;
  amountMinor: number;
}

export interface MonthTotals {
  /** 'YYYY-MM'. */
  month: string;
  incomeMinor: number;
  expenseMinor: number;
}

const NO_CATEGORY = "sem-categoria";
const OTHERS = "outras";

/**
 * Acima disto o excedente vira "Outras". O corte é em seis e não em cinco
 * porque com exatamente seis mostrar as seis é melhor que mostrar cinco e um
 * "Outras" de uma categoria só.
 */
const MAX_SLICES = 6;

export function filterByMonth(records: TransactionRecord[], month: string): TransactionRecord[] {
  return records.filter((record) => monthOf(record.occurredOn) === month);
}

/**
 * Gasto agregado por categoria, do maior para o menor.
 *
 * Espera registros **já filtrados** por `listTransactions` — não reaplica a
 * regra de visibilidade, então chamar isto com o bucket cru soma lançamento
 * apagado em silêncio.
 */
export function expenseByCategory(
  records: TransactionRecord[],
  state: ProjectionState,
): CategorySlice[] {
  const buckets = new Map<string, CategorySlice>();

  for (const record of records) {
    if (record.kind !== "expense") continue;

    const key = record.categoryId ?? NO_CATEGORY;
    const existing = buckets.get(key);
    if (existing !== undefined) {
      existing.amountMinor += record.amountMinor;
      continue;
    }

    // Categoria viva empresta a cor dela; ausente ou apagada cai no neutro.
    // O nome sai do resolvedor que já existe, inclusive o "Categoria removida".
    const category = record.categoryId === null ? undefined : state.categories[record.categoryId];
    const alive = category?.materialized && !category.deleted;

    buckets.set(key, {
      key,
      name: resolveCategoryName(state, record.categoryId),
      color: alive && category !== undefined ? category.color : NEUTRAL_TOKEN,
      amountMinor: record.amountMinor,
    });
  }

  const slices = [...buckets.values()].sort((a, b) => {
    if (a.amountMinor !== b.amountMinor) return b.amountMinor - a.amountMinor;
    // Desempate por chave: sem ele a ordem depende da inserção no Map e as
    // fatias trocam de lugar a cada refold do log.
    if (a.key === b.key) return 0;
    return a.key < b.key ? -1 : 1;
  });

  if (slices.length <= MAX_SLICES) return slices;

  const head = slices.slice(0, MAX_SLICES - 1);
  const rest = slices.slice(MAX_SLICES - 1);

  return [
    ...head,
    {
      key: OTHERS,
      name: "Outras",
      color: NEUTRAL_TOKEN,
      amountMinor: rest.reduce((sum, slice) => sum + slice.amountMinor, 0),
    },
  ];
}

/**
 * Receita e despesa por mês, uma entrada para cada mês pedido.
 *
 * Os baldes nascem zerados a partir de `months`, e não dos registros: é isso que
 * garante que um mês sem lançamento continue ocupando a posição dele no eixo.
 *
 * Pré-condição: `months` não tem repetição. Com mês repetido os baldes
 * colapsam e a saída fica menor que a entrada — hoje a única origem é
 * `lastMonths`, que nunca repete.
 */
export function monthlyTotals(records: TransactionRecord[], months: string[]): MonthTotals[] {
  const buckets = new Map<string, MonthTotals>();
  for (const month of months) {
    buckets.set(month, { month, incomeMinor: 0, expenseMinor: 0 });
  }

  for (const record of records) {
    const entry = buckets.get(monthOf(record.occurredOn));
    // Fora da janela pedida. Não é erro: o log guarda tudo, a janela é da tela.
    if (entry === undefined) continue;
    if (record.kind === "income") entry.incomeMinor += record.amountMinor;
    else entry.expenseMinor += record.amountMinor;
  }

  // O Map preserva a ordem de inserção, que é a ordem de `months`.
  return [...buckets.values()];
}
