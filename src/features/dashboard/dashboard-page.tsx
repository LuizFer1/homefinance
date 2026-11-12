import { useState } from "preact/hooks";
import { budgetReport } from "../../domain/budgets/status";
import { shiftMonth } from "../../domain/dates/calendar";
import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import type { Transaction } from "../../domain/model/transaction";
import { filterByMonth, monthlyTotals } from "../../domain/projections/breakdown";
import { capitalByKind, debtTotal } from "../../domain/projections/business";
import { dailyExpenses, expensesOn } from "../../domain/projections/daily-expenses";
import { nextMonthFreeMoney, recurringMonth } from "../../domain/projections/free-money";
import {
  cashbackSummary,
  categoryBreakdown,
  monthComparison,
  spendingPace,
} from "../../domain/projections/insights";
import { lastMonths, monthLabelLong, monthOf } from "../../domain/projections/periods";
import { upcomingRecurrences } from "../../domain/recurrence/upcoming";
import { Button } from "../ui/button";
import { MonthPicker } from "../ui/month-picker";
import { PageHeader } from "../ui/page-header";
import { BusinessBlock } from "./business-block";
import { CalendarSheet } from "./calendar-sheet";
import { CategoryRows, visibleRows, withBudgets } from "./category-rows";
import { DaySheet } from "./day-sheet";
import { FreeMoneyCard } from "./free-money";
import { HistorySheet } from "./history-sheet";
import { ListSheet } from "./list-sheet";
import { Block, monthWord, TextLink } from "./parts";
import { SummaryCard } from "./summary-card";
import { UPCOMING_PREVIEW, UpcomingList } from "./upcoming-list";

export interface DashboardPageProps {
  /** Já filtrados por `listTransactions`: o App calcula uma vez e reusa. */
  items: Transaction[];
  /** Resolve categorias, formas de pagamento e séries recorrentes. */
  state: AppState;
  /** Hoje em 'YYYY-MM-DD'. Vem de fora pelo mesmo motivo que no App. */
  today: string;
  /** Botão do estado vazio. */
  onGoHome?: () => void;
  /** Abre o Orçamento. Sem ele, o link "Ver orçamento" não tem para onde levar e some. */
  onOpenBudgets?: () => void;
  /** Perfil deste aparelho, para o "Você" nas linhas do dia. */
  currentUserId?: Ulid | null;
  /** Abre a edição de um lançamento da lista do dia. Sem ele, tocar na linha não faz nada. */
  onEdit?: (record: Transaction) => void;
  /**
   * Conta comercial ativa: o bloco "Negócio" aparece acima dos demais. Vem do App (a
   * conta ativa), e não de "existem bens": uma conta comercial recém-criada, sem bem
   * nenhum, também mostra o bloco, e a pessoal nunca.
   */
  business?: boolean;
}

/**
 * Quantos meses a série de barras compara. Mudar este número obriga a mudar o
 * título "Últimos 6 meses" e a frase "últimos seis meses" do vazio (em
 * `history-sheet` e no card do saldo) — por extenso, não dá para compor daqui.
 */
const HISTORY_MONTHS = 6;
/** Janela dos "Recorrentes a caminho". */
const UPCOMING_DAYS = 30;

/** Os sheets de consulta. O do dia fica à parte: ele guarda qual dia, não só "aberto". */
type Sheet = "calendar" | "history" | "categories" | "upcoming";

/** Esqueleto do vazio: rosca-fantasma e barras tracejadas sobre a régua. */
function EmptyDashboard({ month, onGoHome }: { month: string; onGoHome?: () => void }) {
  return (
    <div class="mt-8">
      <div aria-hidden="true" class="flex items-end justify-between gap-6">
        <span class="mb-3 size-32 shrink-0 rounded-full border-[12px] border-neutral-800/70" />
        <span class="flex h-28 flex-1 items-end justify-end gap-2">
          {[48, 78, 35, 100, 66].map((height) => (
            <span
              key={height}
              class="max-w-8 flex-1 rounded-t-[4px] border border-b-0 border-dashed border-neutral-700"
              style={{ height: `${height}%` }}
            />
          ))}
        </span>
      </div>
      <div aria-hidden="true" class="hf-rule-both" />
      <h2 class="mt-8 text-xl font-medium">O resumo de {monthWord(month)} aparece aqui</h2>
      <p class="mt-2 max-w-80 text-sm leading-normal text-fg/62 text-pretty">
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
 * Resumo: "como estou indo", não só "quanto". (O arquivo e o componente seguem
 * `dashboard`: é o `id` da aba e o nome da feature; só o título visível mudou.)
 *
 * Três blocos, um por pergunta: **Como estou** (saldo com o ritmo colado),
 * **Para onde foi** (categorias com a meta na própria linha) e **O que vem**
 * (dinheiro livre e recorrentes, só no mês corrente). O que é consulta —
 * calendário, seis meses, listas inteiras — fica a um toque, num sheet, em vez
 * de ocupar a rolagem. O seletor de mês recalcula tudo.
 */
export function DashboardPage({
  items,
  state,
  today,
  onGoHome,
  onOpenBudgets,
  currentUserId = null,
  onEdit,
  business = false,
}: DashboardPageProps) {
  const current = monthOf(today);
  const [month, setMonth] = useState(current);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const header = (
    <PageHeader
      title="Resumo"
      action={<MonthPicker month={month} current={current} onChange={setMonth} />}
    />
  );

  // Antes do vazio: um negócio com bens e dívidas e nenhum lançamento ainda precisa
  // enxergar o patrimônio. Resultado, receitas e despesas saem do mesmo `monthComparison`
  // do card do saldo, para os dois nunca discordarem.
  const businessBlock = business ? (
    <BusinessBlock
      month={monthComparison(items, month).current}
      capital={capitalByKind(Object.values(state.assets))}
      debtMinor={debtTotal(Object.values(state.debts))}
    />
  ) : null;

  if (items.length === 0) {
    return (
      <section aria-label="Resumo">
        {header}
        {businessBlock !== null && <div class="mt-5">{businessBlock}</div>}
        <EmptyDashboard month={month} onGoHome={onGoHome} />
      </section>
    );
  }

  const isCurrent = month === current;
  const monthItems = filterByMonth(items, month);
  const comparison = monthComparison(items, month);
  const previous = shiftMonth(month, -1);
  const pace = spendingPace(items, month, today);
  // Médias só sobre os dias que já aconteceram: o mesmo corte do ritmo de gastos.
  const daily = dailyExpenses(items, month, pace.cutoff);
  const budgets = budgetReport(items, state, month).rows;
  const categories = withBudgets(categoryBreakdown(monthItems, state), budgets);
  const shown = visibleRows(categories);
  // Do mês do seletor, não de hoje: a barra de agosto mede contra a renda fixa de agosto.
  const categoryScale = recurringMonth(state, month).incomeMinor;
  const bars = monthlyTotals(items, lastMonths(`${month}-01`, HISTORY_MONTHS));
  const upcoming = isCurrent ? upcomingRecurrences(state, today, UPCOMING_DAYS) : [];
  // Só no mês corrente: "mês que vem" de um mês passado já aconteceu e está no extrato.
  const free = isCurrent ? nextMonthFreeMoney(state, today) : null;
  const showFree = free !== null && (free.incomeMinor > 0 || free.expenseMinor > 0);
  const hasExpense = comparison.current.expenseMinor > 0;
  const label = monthLabelLong(month);

  // O `close` nativo do <dialog> dispara também quando o sheet fecha por prop. Sem
  // conferir quem está aberto, o evento atrasado de um sheet fecharia o seguinte.
  const close = (name: Sheet) => () => setSheet((open) => (open === name ? null : open));

  function closeDay() {
    // Mesma razão do `close` acima: depois de fechado, o evento nativo chega de
    // novo e reabriria o calendário por baixo de quem foi editar um lançamento.
    if (pickedDay === null) return;
    setPickedDay(null);
    setSheet("calendar");
  }

  return (
    <section aria-label="Resumo">
      {header}
      {/* O seletor já diz o mês; a forma por extenso fica para o leitor de tela. */}
      <p class="sr-only">{label}</p>

      <div class="mt-5 space-y-8">
        {businessBlock}

        <Block title="Como estou">
          <SummaryCard
            month={month}
            previous={previous}
            hadPrevious={filterByMonth(items, previous).length > 0}
            isCurrent={isCurrent}
            comparison={comparison}
            pace={pace}
            cashback={cashbackSummary(monthItems, state)}
            onOpenCalendar={hasExpense ? () => setSheet("calendar") : undefined}
            onOpenHistory={() => setSheet("history")}
          />
        </Block>

        <Block
          title="Para onde foi"
          aside={
            categories.length > 0
              ? `${categories.length} ${categories.length === 1 ? "categoria" : "categorias"}`
              : undefined
          }
        >
          <div class="rounded-lg bg-surface p-4">
            {categories.length === 0 ? (
              <p class="text-sm text-fg/55">Nenhuma despesa em {label}</p>
            ) : (
              <CategoryRows rows={shown} scaleMinor={categoryScale} />
            )}
            {(categories.length > shown.length ||
              (onOpenBudgets !== undefined && budgets.length > 0)) && (
              <div class="mt-2 -mb-2 flex items-center justify-between gap-3">
                {categories.length > shown.length ? (
                  <TextLink caret onClick={() => setSheet("categories")}>
                    Ver todas as {categories.length}
                  </TextLink>
                ) : (
                  <span />
                )}
                {onOpenBudgets !== undefined && budgets.length > 0 && (
                  <TextLink onClick={onOpenBudgets}>Ver orçamento</TextLink>
                )}
              </div>
            )}
          </div>
        </Block>

        {(showFree || upcoming.length > 0) && (
          <Block title="O que vem">
            {showFree && <FreeMoneyCard free={free} />}
            {upcoming.length > 0 && (
              <section aria-label="Próximas recorrentes" class="rounded-lg bg-surface px-4 py-2">
                <div class="flex min-h-9 items-center justify-between gap-3">
                  <h3 class="text-sm text-fg/60">Próximas recorrentes</h3>
                  <span class="text-xs text-fg/55">próximos {UPCOMING_DAYS} dias</span>
                </div>
                <UpcomingList
                  items={upcoming.slice(0, UPCOMING_PREVIEW)}
                  state={state}
                  today={today}
                />
                {upcoming.length > UPCOMING_PREVIEW && (
                  <TextLink caret onClick={() => setSheet("upcoming")}>
                    Ver todas as {upcoming.length}
                  </TextLink>
                )}
              </section>
            )}
          </Block>
        )}
      </div>

      <CalendarSheet
        open={sheet === "calendar"}
        month={month}
        daily={daily}
        today={today}
        onPickDay={(date) => {
          // Um <dialog> modal por vez: o do dia por cima deixaria o calendário aberto
          // por baixo, com dois grabbers e dois backdrops.
          setSheet(null);
          setPickedDay(date);
        }}
        onClose={close("calendar")}
      />
      <HistorySheet open={sheet === "history"} bars={bars} onClose={close("history")} />
      <ListSheet
        open={sheet === "categories"}
        title="Todas as categorias"
        note={label}
        onClose={close("categories")}
      >
        <CategoryRows rows={categories} scaleMinor={categoryScale} />
      </ListSheet>
      <ListSheet
        open={sheet === "upcoming"}
        title="Recorrentes a caminho"
        note={`próximos ${UPCOMING_DAYS} dias`}
        onClose={close("upcoming")}
      >
        <UpcomingList items={upcoming} state={state} today={today} />
      </ListSheet>
      <DaySheet
        date={pickedDay}
        items={pickedDay === null ? [] : expensesOn(items, pickedDay, state)}
        state={state}
        today={today}
        currentUserId={currentUserId}
        onEdit={(record) => {
          setSheet(null);
          onEdit?.(record);
        }}
        onClose={closeDay}
      />
    </section>
  );
}
