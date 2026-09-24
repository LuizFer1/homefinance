import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { shiftMonth } from "../../domain/dates/calendar";
import { formatBRL } from "../../domain/money/money";
import type { ProjectionState, TransactionRecord } from "../../domain/projections/apply";
import { filterByMonth, monthlyTotals } from "../../domain/projections/breakdown";
import {
  averageSurplus,
  cashbackSummary,
  categoryBreakdown,
  monthComparison,
  spendingPace,
} from "../../domain/projections/insights";
import {
  daysBetween,
  lastMonths,
  monthLabelLong,
  monthLabelShort,
  monthOf,
  shortDate,
} from "../../domain/projections/periods";
import { findCategory } from "../../domain/projections/selectors";
import { upcomingRecurrences } from "../../domain/recurrence/upcoming";
import { cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";
import { Button } from "../ui/button";
import { Money, signedBRL, wholeBRL } from "../ui/money";
import { PageHeader } from "../ui/page-header";
import { IconTile } from "../ui/tile";
import { BarChart } from "./bar-chart";
import { PaceChart } from "./pace-chart";

export interface DashboardPageProps {
  /** Já filtrados por `listTransactions`: o App calcula uma vez e reusa. */
  items: TransactionRecord[];
  /** Resolve categorias, formas de pagamento e séries recorrentes. */
  state: ProjectionState;
  /** Hoje em 'YYYY-MM-DD'. Vem de fora pelo mesmo motivo que no App. */
  today: string;
  /** Botão do estado vazio. */
  onGoHome?: () => void;
}

/**
 * Quantos meses a série de barras compara. Mudar este número obriga a mudar a
 * frase "últimos seis meses" do vazio — por extenso, não dá para compor daqui.
 */
const WINDOW = 6;
/** Janela dos "Recorrentes a caminho". */
const UPCOMING_DAYS = 30;

function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section aria-label={title} class="rounded-lg bg-surface p-4">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-base font-medium">{title}</h2>
        {aside !== undefined && <span class="text-xs text-fg/55">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}

/** "Set 2026" do seletor. */
function pickerLabel(month: string): string {
  return `${capitalize(monthLabelShort(month))} ${month.slice(0, 4)}`;
}

/** Nome do mês sem o ano ("agosto"), para as frases de comparação. */
function monthWord(month: string): string {
  return monthLabelLong(month).split(" ")[0] ?? "";
}

function MonthPicker({
  month,
  current,
  onChange,
}: {
  month: string;
  current: string;
  onChange: (month: string) => void;
}) {
  const atPresent = month >= current;

  return (
    <div class="flex h-9 shrink-0 items-center rounded-lg border border-divider">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonth(month, -1))}
        class="hf-press grid h-full w-8 place-items-center text-fg/75"
      >
        <Icon name="caret-left" size={16} />
      </button>
      <span aria-live="polite" class="hf-num px-0.5 text-[13px] font-medium">
        {pickerLabel(month)}
      </span>
      {/* O futuro não tem lançamento: a seta fica a 30% e não anda. */}
      <button
        type="button"
        aria-label="Próximo mês"
        disabled={atPresent}
        onClick={() => onChange(shiftMonth(month, 1))}
        class="hf-press grid h-full w-8 place-items-center text-fg/75 disabled:opacity-30"
      >
        <Icon name="caret-right" size={16} />
      </button>
    </div>
  );
}

/** Esqueleto do vazio: rosca-fantasma e barras tracejadas sobre a régua. */
function EmptyDashboard({ month, onGoHome }: { month: string; onGoHome?: () => void }) {
  return (
    <div class="mt-8">
      <div aria-hidden="true" class="flex items-end justify-between gap-6">
        <span class="mb-3 size-[130px] shrink-0 rounded-full border-[14px] border-neutral-800/70" />
        <span class="flex h-[112px] flex-1 items-end justify-end gap-2">
          {[48, 78, 35, 100, 66].map((height) => (
            <span
              key={height}
              class="max-w-8 flex-1 rounded-t-[3px] border border-b-0 border-dashed border-neutral-700"
              style={{ height: `${height}%` }}
            />
          ))}
        </span>
      </div>
      <div aria-hidden="true" class="hf-rule-both" />
      <h2 class="mt-8 text-xl font-medium">O resumo de {monthWord(month)} aparece aqui</h2>
      <p class="mt-2 max-w-[20rem] text-sm leading-normal text-fg/62 text-pretty">
        Registre o primeiro lançamento em Início para ver saldo do mês, ritmo de gastos e para onde
        vai o dinheiro.
      </p>
      {onGoHome !== undefined && (
        <Button class="mt-6 h-11 px-5 text-sm" icon="arrow-right" onClick={onGoHome}>
          Ir para Início
        </Button>
      )}
    </div>
  );
}

/**
 * Dashboard: "como estou indo", não só "quanto".
 *
 * Cada card responde uma pergunta: o saldo compara com o mês anterior, o ritmo
 * compara no mesmo dia, "para onde foi" ordena as categorias, "a caminho"
 * antecipa o que a recorrência vai lançar. O seletor de mês recalcula tudo.
 */
export function DashboardPage({ items, state, today, onGoHome }: DashboardPageProps) {
  const current = monthOf(today);
  const [month, setMonth] = useState(current);

  const header = (
    <PageHeader
      title="Dashboard"
      action={<MonthPicker month={month} current={current} onChange={setMonth} />}
    />
  );

  if (items.length === 0) {
    return (
      <section aria-label="Dashboard">
        {header}
        <EmptyDashboard month={month} onGoHome={onGoHome} />
      </section>
    );
  }

  const monthItems = filterByMonth(items, month);
  const comparison = monthComparison(items, month);
  const summary = comparison.current;
  const previous = shiftMonth(month, -1);
  const hadPrevious = filterByMonth(items, previous).length > 0;
  const pace = spendingPace(items, month, today);
  const categories = categoryBreakdown(monthItems, state);
  const biggest = categories[0]?.amountMinor ?? 0;
  const bars = monthlyTotals(items, lastMonths(`${month}-01`, WINDOW));
  const upcoming = month === current ? upcomingRecurrences(state, today, UPCOMING_DAYS) : [];
  const cashback = cashbackSummary(monthItems, state);
  const moved = summary.incomeMinor + summary.expenseMinor;
  const label = monthLabelLong(month);
  const up = comparison.deltaMinor >= 0;

  return (
    <section aria-label="Dashboard">
      {header}
      {/* O seletor já diz o mês; a forma por extenso fica para o leitor de tela. */}
      <p class="sr-only">{label}</p>

      <div class="mt-5 space-y-3.5">
        <section aria-label="Saldo do mês" class="rounded-lg bg-surface p-4">
          <h2 class="hf-label">Saldo do mês</h2>
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
              class={`mt-2 flex items-center gap-1.5 text-[13px] ${
                up ? "text-income-fg" : "text-expense-fg"
              }`}
            >
              <Icon name={up ? "trend-up" : "trend-down"} size={16} />
              {comparison.deltaMinor === 0
                ? `Igual a ${monthWord(previous)}`
                : `${formatBRL(Math.abs(comparison.deltaMinor))} a ${up ? "mais" : "menos"} que ${monthWord(previous)}`}
            </p>
          )}
          <div
            aria-hidden="true"
            class="mt-4 flex h-1.5 gap-[3px] overflow-hidden rounded-full bg-neutral-800"
          >
            {moved > 0 && (
              <>
                <span class="rounded-full bg-income" style={{ flexGrow: summary.incomeMinor }} />
                <span class="rounded-full bg-expense" style={{ flexGrow: summary.expenseMinor }} />
              </>
            )}
          </div>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p class="flex items-center gap-1.5 text-xs text-fg/55">
                <span aria-hidden="true" class="size-2 rounded-full bg-income" />
                Receitas
              </p>
              <p data-testid="total-income" class="hf-num mt-1 text-[15px] font-medium">
                {formatBRL(summary.incomeMinor)}
              </p>
            </div>
            <div>
              <p class="flex items-center gap-1.5 text-xs text-fg/55">
                <span aria-hidden="true" class="size-2 rounded-full bg-expense" />
                Despesas
              </p>
              <p data-testid="total-expense" class="hf-num mt-1 text-[15px] font-medium">
                {formatBRL(summary.expenseMinor)}
              </p>
            </div>
          </div>
          <p class="sr-only">
            {comparison.count} {comparison.count === 1 ? "lançamento" : "lançamentos"} no mês.
          </p>
        </section>

        {summary.expenseMinor > 0 && (
          <Card
            title="Ritmo de gastos"
            aside={
              <span class="flex items-center gap-3">
                <span class="flex items-center gap-1.5">
                  <span aria-hidden="true" class="h-0.5 w-3 rounded-full bg-accent" />
                  {monthLabelShort(month)}
                </span>
                <span class="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    class="w-3 border-t-[1.5px] border-dashed border-neutral-600"
                  />
                  {monthLabelShort(previous)}
                </span>
              </span>
            }
          >
            <p class="mt-2 text-[13px] leading-normal text-fg/70 text-pretty">
              {formatBRL(pace.spentMinor)} até o dia {pace.cutoff}
              {pace.change !== null && (
                <>
                  {" — "}
                  <strong
                    class={`font-medium ${pace.change <= 0 ? "text-income-fg" : "text-expense-fg"}`}
                  >
                    {Math.round(Math.abs(pace.change) * 100)}%{" "}
                    {pace.change <= 0 ? "abaixo" : "acima"}
                  </strong>{" "}
                  do mesmo ponto de {monthWord(previous)}
                </>
              )}
              .
            </p>
            <PaceChart
              pace={pace}
              showToday={month === current}
              monthShort={monthLabelShort(month)}
            />
          </Card>
        )}

        <Card
          title="Para onde foi"
          aside={
            categories.length > 0
              ? `${categories.length} ${categories.length === 1 ? "categoria" : "categorias"}`
              : undefined
          }
        >
          {categories.length === 0 ? (
            <p class="mt-3 text-sm text-fg/55">Nenhuma despesa em {label}.</p>
          ) : (
            <ul class="mt-3 space-y-3">
              {categories.map((row) => (
                <li key={row.id ?? "sem-categoria"}>
                  <div class="flex items-center gap-2.5">
                    <IconTile icon={row.icon} color={row.color} size={28} iconSize={15} />
                    <span class="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                    <span class="hf-num text-sm font-medium">{formatBRL(row.amountMinor)}</span>
                    <span class="hf-num w-9 text-right text-xs text-fg/50">
                      {Math.round(row.share * 100)}%
                    </span>
                  </div>
                  <div class="mt-1.5 ml-[38px] h-1 overflow-hidden rounded-full bg-neutral-900">
                    <span
                      class="block h-full rounded-full"
                      style={{
                        width: `${Math.max(3, (row.amountMinor / biggest) * 100)}%`,
                        backgroundColor: cssVarForToken(row.color),
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {upcoming.length > 0 && (
          <Card title="Recorrentes a caminho" aside={`próximos ${UPCOMING_DAYS} dias`}>
            <ul class="mt-2">
              {upcoming.map((item, index) => {
                const category = findCategory(state, item.categoryId);
                const income = item.kind === "income";
                const inDays = daysBetween(today, item.date);
                return (
                  <li
                    key={`${item.recurrenceId}-${item.date}`}
                    class="relative flex h-[58px] items-center gap-3"
                  >
                    {index > 0 && (
                      <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-11" />
                    )}
                    <IconTile
                      icon={category?.icon ?? "repeat"}
                      color={category?.color ?? null}
                      size={32}
                      iconSize={16}
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium">{item.description}</span>
                      <span class="mt-0.5 block text-xs text-fg/55">
                        {shortDate(item.date, today)} · em {inDays} {inDays === 1 ? "dia" : "dias"}
                      </span>
                    </span>
                    <span class={`hf-num text-sm font-medium ${income ? "text-income-fg" : ""}`}>
                      {signedBRL(income ? item.amountMinor : -item.amountMinor, "always")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card
          title="Receita × despesa"
          aside={
            <span class="flex items-center gap-3">
              <span class="flex items-center gap-1.5">
                <span aria-hidden="true" class="size-1.5 rounded-full bg-income" />
                receita
              </span>
              <span class="flex items-center gap-1.5">
                <span aria-hidden="true" class="size-1.5 rounded-full bg-expense" />
                despesa
              </span>
            </span>
          }
        >
          {bars.every((item) => item.incomeMinor === 0 && item.expenseMinor === 0) ? (
            <p class="mt-3 text-sm text-fg/55">Sem movimento nos últimos seis meses.</p>
          ) : (
            <>
              <p class="mt-2 text-[13px] text-fg/70">
                Sobrou em média {wholeBRL(averageSurplus(bars))} por mês desde{" "}
                {monthWord(bars[0]?.month ?? month)}.
              </p>
              <BarChart data={bars} />
            </>
          )}
        </Card>

        {cashback.purchases > 0 && (
          <section
            aria-label="Cashback"
            class="flex items-center gap-3.5 rounded-lg bg-surface p-4"
          >
            <span
              aria-hidden="true"
              class="grid size-10 shrink-0 place-items-center rounded-lg text-accent-300
                shadow-[inset_0_0_0_1px_var(--color-accent)]"
            >
              <Icon name="coins" size={20} />
            </span>
            <span class="min-w-0">
              <span class="block text-[15px] font-medium">
                {formatBRL(cashback.totalMinor)} de cashback
              </span>
              <span class="mt-0.5 block text-xs text-fg/55">
                Em {monthWord(month)} · {cashback.purchases}{" "}
                {cashback.purchases === 1 ? "compra" : "compras"} no crédito e débito
              </span>
            </span>
          </section>
        )}
      </div>
    </section>
  );
}
