import { formatBRL } from "../../domain/money/money";
import type { ProjectionState, TransactionRecord } from "../../domain/projections/apply";
import {
  expenseByCategory,
  filterByMonth,
  monthlyTotals,
} from "../../domain/projections/breakdown";
import { lastMonths, monthLabelLong, monthOf } from "../../domain/projections/periods";
import { totals } from "../../domain/projections/selectors";
import { BarChart } from "./bar-chart";
import { DonutChart } from "./donut-chart";

export interface DashboardPageProps {
  /** Já filtrados por `listTransactions`: o App calcula uma vez e reusa. */
  items: TransactionRecord[];
  /** Necessário para resolver nome e cor das categorias das fatias. */
  state: ProjectionState;
  /** Hoje em 'YYYY-MM-DD'. Vem de fora pelo mesmo motivo que no App. */
  today: string;
}

const CARD = "rounded-box border border-base-content/10 bg-base-100/60 px-4 py-3";
const CAPTION = "hf-caption text-[0.6875rem] font-semibold uppercase text-base-content/45";
const EMPTY =
  "rounded-box border border-base-content/10 bg-base-100/60 px-4 py-8 text-center text-sm " +
  "text-base-content/45";

/** Quantos meses a série de barras compara. Uma barra sozinha não compara com nada. */
const WINDOW = 6;

/**
 * O dashboard é do **mês corrente**; o cabeçalho fixo é o total.
 *
 * São recortes diferentes de propósito, e cada um diz qual é o seu: dois
 * números chamados "saldo" na mesma tela seria um bug de leitura no primeiro mês
 * em que eles deixassem de coincidir.
 */
export function DashboardPage({ items, state, today }: DashboardPageProps) {
  if (items.length === 0) {
    return (
      <section aria-label="Dashboard">
        <h2 class={`${CAPTION} mt-4`}>Resumo</h2>
        <p class={`${EMPTY} mt-3`}>Nenhum lançamento ainda. Registre o primeiro em Início.</p>
      </section>
    );
  }

  const month = monthOf(today);
  const label = monthLabelLong(month);
  const monthItems = filterByMonth(items, month);
  const summary = totals(monthItems);
  const slices = expenseByCategory(monthItems, state);
  const bars = monthlyTotals(items, lastMonths(today, WINDOW));
  const negative = summary.balanceMinor < 0;
  const idle = bars.every((item) => item.incomeMinor === 0 && item.expenseMinor === 0);

  return (
    <section aria-label="Dashboard">
      <h2 class={`${CAPTION} mt-4`}>{label}</h2>

      <div class={`${CARD} mt-3`}>
        <p class={CAPTION}>Saldo do mês</p>
        <p
          data-testid="dashboard-balance"
          class={`hf-display mt-1 text-[1.75rem] font-semibold ${negative ? "text-error" : ""}`}
        >
          {formatBRL(summary.balanceMinor)}
        </p>
      </div>

      {/*
        Os rótulos já dizem o que cada número é, então cor aqui seria
        decorativa. Ela fica reservada para o saldo negativo, que é o único
        portador de significado nesta tela.
      */}
      <div class="mt-3 grid grid-cols-2 gap-3">
        <div class={CARD}>
          <p class={CAPTION}>Receitas</p>
          <p data-testid="total-income" class="hf-num mt-0.5 font-semibold">
            {formatBRL(summary.incomeMinor)}
          </p>
        </div>
        <div class={CARD}>
          <p class={CAPTION}>Despesas</p>
          <p data-testid="total-expense" class="hf-num mt-0.5 font-semibold">
            {formatBRL(summary.expenseMinor)}
          </p>
        </div>
      </div>

      <p class="mt-3 text-xs text-base-content/40">
        {monthItems.length} {monthItems.length === 1 ? "lançamento" : "lançamentos"} no mês.
      </p>

      <h2 class={`${CAPTION} mt-6`}>Gasto por categoria</h2>
      {/*
        A checagem é sobre o total de despesa, e não sobre `slices.length`: um
        mês só com despesas de valor zero produziria fatias que somam zero, e a
        rosca não teria como se desenhar.
      */}
      {summary.expenseMinor === 0 ? (
        <p class={`${EMPTY} mt-3`}>Nenhuma despesa em {label}.</p>
      ) : (
        <div class={`${CARD} mt-3`}>
          <DonutChart slices={slices} caption="no mês" />
        </div>
      )}

      <h2 class={`${CAPTION} mt-6`}>Receita x despesa</h2>
      {idle ? (
        <p class={`${EMPTY} mt-3`}>Sem movimento nos últimos seis meses.</p>
      ) : (
        <div class={`${CARD} mt-3`}>
          <BarChart data={bars} />
        </div>
      )}
    </section>
  );
}
