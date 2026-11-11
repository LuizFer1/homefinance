import type {
  CashbackSummary,
  MonthComparison,
  SpendingPace,
} from "../../domain/projections/insights";
import { monthLabelShort } from "../../domain/projections/periods";
import { Icon } from "../icons/icon";
import { brl, Money } from "../ui/money";
import { PaceChart } from "./pace-chart";
import { monthWord } from "./parts";

export interface SummaryCardProps {
  month: string;
  /** Mês anterior ao escolhido, 'YYYY-MM'. */
  previous: string;
  /** Há lançamento no mês anterior: sem isso a comparação seria contra zero. */
  hadPrevious: boolean;
  /** O mês escolhido é o corrente (régua de "hoje" no ritmo). */
  isCurrent: boolean;
  comparison: MonthComparison;
  pace: SpendingPace;
  cashback: CashbackSummary;
  /** Ausente quando o mês não tem despesa: não há calendário para abrir. */
  onOpenCalendar?: () => void;
  onOpenHistory: () => void;
}

function RowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      class="hf-press flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm
        text-fg/80"
    >
      {label}
      <Icon name="caret-right" size={16} class="text-fg/50" />
    </button>
  );
}

/**
 * "Como estou": o saldo do mês com o ritmo de gastos colado nele.
 *
 * Um card só, de propósito. O saldo diz quanto e o ritmo diz se está indo bem;
 * separados em dois cards, o gráfico disputava atenção com o calendário e com as
 * barras de seis meses. Aqueles dois viraram consulta: uma linha no rodapé que
 * abre um sheet.
 */
export function SummaryCard({
  month,
  previous,
  hadPrevious,
  isCurrent,
  comparison,
  pace,
  cashback,
  onOpenCalendar,
  onOpenHistory,
}: SummaryCardProps) {
  const summary = comparison.current;
  const up = comparison.deltaMinor >= 0;
  const hasExpense = summary.expenseMinor > 0;

  return (
    <section aria-label="Saldo do mês" class="rounded-lg bg-surface p-4">
      <h3 class="text-sm text-fg/60">Saldo do mês</h3>
      <p class="mt-2">
        <Money
          minor={summary.balanceMinor}
          size={36}
          testId="dashboard-balance"
          class={summary.balanceMinor < 0 ? "text-expense-fg" : ""}
        />
      </p>
      {hadPrevious && (
        <p
          class={`mt-2 flex items-center gap-2 text-sm ${
            up ? "text-income-fg" : "text-expense-fg"
          }`}
        >
          <Icon name={up ? "trend-up" : "trend-down"} size={16} />
          {comparison.deltaMinor === 0
            ? `Igual a ${monthWord(previous)}`
            : `${brl(Math.abs(comparison.deltaMinor))} a ${up ? "mais" : "menos"} que ${monthWord(previous)}`}
        </p>
      )}
      <div class="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p class="flex items-center gap-2 text-xs text-fg/55">
            <span aria-hidden="true" class="size-2 rounded-full bg-income" />
            Receitas
          </p>
          <p data-testid="total-income" class="hf-num mt-1 text-base font-medium">
            {brl(summary.incomeMinor)}
          </p>
        </div>
        <div>
          <p class="flex items-center gap-2 text-xs text-fg/55">
            <span aria-hidden="true" class="size-2 rounded-full bg-expense" />
            Despesas
          </p>
          <p data-testid="total-expense" class="hf-num mt-1 text-base font-medium">
            {brl(summary.expenseMinor)}
          </p>
        </div>
      </div>
      <p class="sr-only">
        {comparison.count} {comparison.count === 1 ? "lançamento" : "lançamentos"} no mês.
      </p>

      {hasExpense && (
        <>
          <div aria-hidden="true" class="hf-rule mt-4" />
          <p data-testid="pace-sentence" class="mt-4 text-sm leading-normal text-fg/70 text-pretty">
            {brl(pace.spentMinor)} até o dia {pace.cutoff}
            {pace.change !== null && (
              <>
                {" — "}
                <strong
                  class={`font-medium ${pace.change <= 0 ? "text-income-fg" : "text-expense-fg"}`}
                >
                  {Math.round(Math.abs(pace.change) * 100)}% {pace.change <= 0 ? "abaixo" : "acima"}
                </strong>{" "}
                do mesmo ponto de {monthWord(previous)}
              </>
            )}
          </p>
          <p class="mt-2 flex items-center gap-4 text-xs text-fg/55">
            <span class="flex items-center gap-2">
              <span aria-hidden="true" class="h-0.5 w-3 rounded-full bg-accent" />
              {monthLabelShort(month)}
            </span>
            <span class="flex items-center gap-2">
              <span
                aria-hidden="true"
                class="w-3 border-t-[1.5px] border-dashed border-neutral-600"
              />
              {monthLabelShort(previous)}
            </span>
          </p>
          <PaceChart pace={pace} showToday={isCurrent} monthShort={monthLabelShort(month)} />
        </>
      )}

      <div aria-hidden="true" class="hf-rule mt-4" />
      {onOpenCalendar !== undefined && (
        <>
          <RowButton label="Saídas por dia" onClick={onOpenCalendar} />
          <div aria-hidden="true" class="hf-rule" />
        </>
      )}
      <RowButton label="Últimos 6 meses" onClick={onOpenHistory} />

      {/*
        Só com cashback de verdade: "R$ 0,00 de cashback" num card próprio ocupava
        a tela para dizer que não aconteceu nada.
      */}
      {cashback.totalMinor > 0 && (
        <p data-testid="cashback-line" class="hf-num mt-2 text-xs text-fg/55 text-pretty">
          {brl(cashback.totalMinor)} de cashback
          {cashback.purchases > 0 &&
            ` · ${cashback.purchases} ${
              cashback.purchases === 1 ? "compra" : "compras"
            } no crédito e débito`}
        </p>
      )}
    </section>
  );
}
