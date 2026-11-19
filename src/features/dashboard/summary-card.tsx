import {
  type Forecast,
  roundToTens,
  SAVINGS_TARGET_PERCENT,
  savingsRate,
  zeroAllowance,
} from "../../domain/projections/forecast";
import type {
  CashbackSummary,
  MonthComparison,
  SpendingPace,
} from "../../domain/projections/insights";
import { monthLabelShort } from "../../domain/projections/periods";
import { Icon } from "../icons/icon";
import { brl, compactBRL, MINUS, Money, wholeBRL } from "../ui/money";
import { PaceChart } from "./pace-chart";

export interface SummaryCardProps {
  month: string;
  /** O mês escolhido é o corrente (régua de "hoje" no ritmo). */
  isCurrent: boolean;
  comparison: MonthComparison;
  pace: SpendingPace;
  /** Previsão de fechamento: só no mês corrente e depois do dia 5; `null` fora disso. */
  forecast: Forecast | null;
  /** Líquido guardado nas reservas no mês (`savedInMonth`); negativo = saiu. */
  savedMinor: number;
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
 * "15% acima do seu normal". Acima é atenção (`warning`), não erro: gastar mais que o
 * normal no meio do mês ainda tem conserto. Abaixo é a boa notícia, em verde; igual
 * fica neutro. O sinal vem já arredondado do domínio, igual ao hub.
 */
function PaceChange({ percent }: { percent: number }) {
  if (percent === 0) {
    return (
      <>
        <strong class="font-medium">igual</strong> ao seu normal
      </>
    );
  }
  const above = percent > 0;
  return (
    <>
      <strong class={`font-medium ${above ? "text-warning" : "text-income-fg"}`}>
        {Math.abs(percent)}% {above ? "acima" : "abaixo"}
      </strong>{" "}
      do seu normal
    </>
  );
}

/** Porcentagem com o menos tipográfico: "−27%". */
function percentText(value: number): string {
  return value < 0 ? `${MINUS}${Math.abs(value)}%` : `${value}%`;
}

/**
 * "Vão faltar ~R$ 960 no fim do mês, se continuar no ritmo atual". No lugar da
 * comparação com o normal no mês corrente: parcial contra mês inteiro enganava, a
 * previsão responde a mesma pergunta ("vai fechar bem?") com o mês inteiro. Faltar é
 * atenção (`warning`), não erro: ainda dá tempo de mudar. O sinal sai do valor já
 * arredondado à dezena, então "~R$ 0" nunca aparece.
 */
function ForecastLine({ forecast }: { forecast: Forecast }) {
  const rounded = roundToTens(forecast.expectedSurplusMinor);
  const tone = rounded < 0 ? "text-warning" : rounded > 0 ? "text-income-fg" : "text-fg/70";
  return (
    <p data-testid="forecast-line" class={`mt-2 flex items-start gap-2 text-sm ${tone}`}>
      <Icon name={rounded < 0 ? "trend-down" : "trend-up"} size={16} class="mt-0.5 shrink-0" />
      <span class="text-pretty">
        {rounded < 0
          ? `Vão faltar ~${wholeBRL(-rounded)} no fim do mês, se continuar no ritmo atual`
          : rounded > 0
            ? `Vão sobrar ~${wholeBRL(rounded)} no fim do mês, se continuar no ritmo atual`
            : "Deve fechar perto do zero, se continuar no ritmo atual"}
      </span>
    </p>
  );
}

/**
 * "Para fechar no zero ~R$ 30 por dia até o dia 30" e a média avulsa que a previsão
 * usa. A média diz "do dia a dia (avulso)" e não "variável": a recorrência de valor
 * variável fica fora dela (entra pela estimativa), e o "variável" de "Para onde foi"
 * a inclui — o mesmo nome para dois números diferentes confundiria.
 */
function ZeroBox({ forecast }: { forecast: Forecast }) {
  const allowance = zeroAllowance(forecast);
  return (
    <div data-testid="zero-box" class="mt-4 rounded-md border border-divider p-3 text-sm">
      {allowance !== null && (
        <p class="text-pretty">
          {allowance > 0
            ? `Para fechar no zero: ~${wholeBRL(allowance)} por dia até o dia ${forecast.daysInMonth}`
            : "As contas que ainda vêm já passam do saldo do mês"}
        </p>
      )}
      <p class={`text-xs text-fg/55 text-pretty ${allowance !== null ? "mt-1" : ""}`}>
        Sua média até aqui: ~{wholeBRL(forecast.casualDailyMinor)} por dia no gasto do dia a dia
        (avulso)
      </p>
    </div>
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
  isCurrent,
  comparison,
  pace,
  forecast,
  savedMinor,
  cashback,
  onOpenCalendar,
  onOpenHistory,
}: SummaryCardProps) {
  const summary = comparison.current;
  // Só mês fechado compara o saldo; o mês corrente tem a previsão no lugar.
  const delta = isCurrent ? null : comparison.deltaMinor;
  const up = delta !== null && delta >= 0;
  const hasExpense = summary.expenseMinor > 0;
  const rate = savingsRate(summary.incomeMinor, summary.expenseMinor);
  const shownForecast = isCurrent ? forecast : null;

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
      {delta !== null && (
        <p
          class={`mt-2 flex items-center gap-2 text-sm ${
            up ? "text-income-fg" : "text-expense-fg"
          }`}
        >
          <Icon name={up ? "trend-up" : "trend-down"} size={16} />
          {delta === 0
            ? "Igual ao seu normal"
            : `${brl(Math.abs(delta))} a ${up ? "mais" : "menos"} que o seu normal`}
        </p>
      )}
      {shownForecast !== null && <ForecastLine forecast={shownForecast} />}
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
      {/* Sem receita não há "% da renda": fica só o saldo. */}
      {rate !== null && (
        <p data-testid="savings-rate" class="mt-3 text-sm text-fg/70 text-pretty">
          Taxa de poupança <strong class="hf-num font-medium text-fg">{percentText(rate)}</strong>{" "}
          {isCurrent ? "até agora" : "no mês"}
          <span class="text-fg/55"> · alvo: {SAVINGS_TARGET_PERCENT}% da renda</span>
        </p>
      )}
      {rate !== null && shownForecast?.expectedSavingsRate != null && (
        <p data-testid="savings-pace" class="mt-1 text-xs text-fg/55">
          No ritmo atual, ~{percentText(shownForecast.expectedSavingsRate)}
        </p>
      )}
      {/*
        Guardar não é despesa, então não abate a taxa: ela já é parte do que sobrou. A
        linha só diz para onde foi (ou de onde veio) uma parte; líquido zero some.
      */}
      {savedMinor !== 0 && (
        <p data-testid="reserves-line" class="hf-num mt-1 text-xs text-fg/55 text-pretty">
          {compactBRL(Math.abs(savedMinor))}{" "}
          {savedMinor < 0 ? "saíram das reservas" : "foram para reservas"}{" "}
          {isCurrent ? "neste mês" : "no mês"}
        </p>
      )}
      {shownForecast !== null && <ZeroBox forecast={shownForecast} />}

      {hasExpense && (
        <>
          <div aria-hidden="true" class="hf-rule mt-4" />
          <p data-testid="pace-sentence" class="mt-4 text-sm leading-normal text-fg/70 text-pretty">
            {brl(pace.spentMinor)} {isCurrent ? `até o dia ${pace.cutoff}` : "no mês"}
            {pace.changePercent !== null && (
              <>
                {" — "}
                <PaceChange percent={pace.changePercent} />
              </>
            )}
          </p>
          <p class="mt-2 flex items-center gap-4 text-xs text-fg/55">
            <span class="flex items-center gap-2">
              <span aria-hidden="true" class="h-0.5 w-3 rounded-full bg-accent" />
              {monthLabelShort(month)}
            </span>
            {pace.normal.length > 0 && (
              <span class="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  class="w-3 border-t-[1.5px] border-dashed border-neutral-600"
                />
                seu normal
              </span>
            )}
            {shownForecast !== null && (
              <span class="flex items-center gap-2">
                <span aria-hidden="true" class="w-3 border-t-[1.5px] border-dashed border-accent" />
                previsão
              </span>
            )}
          </p>
          <PaceChart
            pace={pace}
            showToday={isCurrent}
            monthShort={monthLabelShort(month)}
            forecastMinor={shownForecast?.expectedExpenseMinor ?? null}
          />
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
