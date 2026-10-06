import type { AppState } from "../../domain/model/app-state";
import type { Transaction, TransactionKind } from "../../domain/model/transaction";
import type { User } from "../../domain/model/user";
import { formatBRL } from "../../domain/money/money";
import { filterByMonth } from "../../domain/projections/breakdown";
import { estimatedTotals, pendingEstimates } from "../../domain/projections/estimates";
import { monthLabelLong, monthOf } from "../../domain/projections/periods";
import { totals } from "../../domain/projections/selectors";
import { availableBalance, savedInMonth } from "../../domain/reserves/balances";
import { Icon } from "../icons/icon";
import { Avatar } from "../profile/avatar-view";
import { periodLabel } from "../recurrence/adjust-sheet";
import { TransactionList } from "../transactions/transaction-list";
import { greetingFor } from "../ui/greeting";
import { compactBRL, MINUS, Money, moneyParts } from "../ui/money";
import { QuickActions } from "../ui/quick-actions";

export interface HomePageProps {
  items: Transaction[];
  state: AppState;
  profile: User | null;
  today: string;
  hour: number;
  onCompose: (kind: TransactionKind) => void;
  onImport: () => void;
  onEdit: (record: Transaction) => void;
  /** Abre a confirmação de valor de uma estimativa. */
  onConfirm: (record: Transaction) => void;
  onOpenProfile: () => void;
}

/** "Setembro" — nome do mês, sem o ano, com inicial maiúscula. */
function monthName(month: string): string {
  const long = monthLabelLong(month).split(" ")[0] ?? "";
  return long.charAt(0).toLocaleUpperCase("pt-BR") + long.slice(1);
}

/**
 * Card do mês corrente: receitas, despesas e a barra dividida entre as duas.
 *
 * O saldo total fica acima dele de propósito, e cada número diz qual recorte é
 * o seu: dois valores chamados "saldo" na mesma tela seriam um bug de leitura
 * no primeiro mês em que deixassem de coincidir.
 */
function MonthCard({
  items,
  state,
  today,
}: {
  items: Transaction[];
  state: AppState;
  today: string;
}) {
  const month = monthOf(today);
  const monthItems = filterByMonth(items, month);
  const summary = totals(monthItems);
  const moved = summary.incomeMinor + summary.expenseMinor;
  const estimated = estimatedTotals(monthItems);
  const estimatedMinor = estimated.incomeMinor + estimated.expenseMinor;
  const saved = savedInMonth(state, month);

  return (
    <section aria-label={`Resumo de ${monthName(month)}`} class="mt-6 rounded-lg bg-surface p-4">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-[15px]">{monthName(month)}</h2>
        <p class="hf-num flex gap-3 text-[13px] font-medium">
          <span class="text-income-fg">
            <span class="sr-only">Receitas </span>
            {moneyParts(summary.incomeMinor, "always").sign}
            {moneyParts(summary.incomeMinor).whole}
            {moneyParts(summary.incomeMinor).cents}
          </span>
          <span class="text-expense-fg">
            <span class="sr-only">Despesas </span>
            {MINUS}
            {moneyParts(summary.expenseMinor).whole}
            {moneyParts(summary.expenseMinor).cents}
          </span>
        </p>
      </div>
      {/* Barra dividida proporcional; sem movimento, fica só o trilho. */}
      <div
        aria-hidden="true"
        class="mt-3 flex h-1 gap-[3px] overflow-hidden rounded-full bg-neutral-800"
      >
        {moved > 0 && (
          <>
            <span class="rounded-full bg-income" style={{ flexGrow: summary.incomeMinor }} />
            <span class="rounded-full bg-expense" style={{ flexGrow: summary.expenseMinor }} />
          </>
        )}
      </div>
      {/*
        Os números acima já contam as estimativas — o mês "fecha" com elas. A
        linha só diz quanto disso ainda é palpite.
      */}
      {estimatedMinor > 0 && (
        <p data-testid="month-estimated" class="mt-2.5 text-xs text-fg/55">
          Inclui <span class="hf-num">~{formatBRL(estimatedMinor)}</span> estimado
        </p>
      )}
      {saved !== 0 && (
        <p data-testid="month-saved" class="mt-2.5 text-xs text-fg/55">
          {saved > 0 ? "Separado: " : "Voltou das reservas: "}
          <span class="hf-num">{compactBRL(Math.abs(saved))}</span>
        </p>
      )}
    </section>
  );
}

/**
 * "A confirmar": estimativas de séries variáveis esperando o valor real, de
 * todos os meses. Sem notificação (o app é offline), este é o lembrete — e uma
 * estimativa de agosto esquecida ficaria enterrada no extrato sem ele.
 */
function PendingEstimates({
  state,
  onConfirm,
}: {
  state: AppState;
  onConfirm: (record: Transaction) => void;
}) {
  const pending = pendingEstimates(state);
  if (pending.length === 0) return null;

  return (
    <section aria-label="A confirmar" class="mt-3.5 rounded-lg bg-surface p-4">
      <h2 class="hf-label">A confirmar ({pending.length})</h2>
      <ul class="mt-1">
        {pending.map((record) => (
          <li key={record.id} class="flex items-center gap-3 py-2">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{record.description}</span>
              <span class="mt-0.5 block text-xs text-fg/55">
                {periodLabel(record.occurredOn.slice(0, 7))} ·{" "}
                <span class="hf-num">~{formatBRL(record.amountMinor)}</span>
              </span>
            </span>
            <button
              type="button"
              aria-label={`Confirmar ${record.description}`}
              onClick={() => onConfirm(record)}
              class="hf-press shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium
                text-accent-300 hover:bg-fg/[0.06]"
            >
              Confirmar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Início: saudação, saldo total, o mês, as duas ações diárias e o extrato.
 *
 * O seletor de tema saiu daqui (foi para Ajustes → Aparência): no topo da tela
 * mais usada ele disputava espaço com o saldo por uma decisão que se toma uma
 * vez.
 */
export function HomePage({
  items,
  state,
  profile,
  today,
  hour,
  onCompose,
  onImport,
  onEdit,
  onConfirm,
  onOpenProfile,
}: HomePageProps) {
  // O que está nas reservas não é para gastar: contá-lo aqui de novo mostraria
  // o mesmo dinheiro em dois lugares (saldo e reserva) e o saldo pareceria maior
  // do que realmente se pode usar.
  const available = availableBalance(state);
  const savedThisMonth = savedInMonth(state, monthOf(today)) !== 0;

  return (
    <>
      <header class="flex items-center justify-between gap-4">
        <h1 class="min-w-0 truncate text-sm text-fg/65">{greetingFor(hour, profile?.name)}</h1>
        {profile !== null && (
          <button
            type="button"
            aria-label="Editar perfil"
            onClick={onOpenProfile}
            class="hf-press shrink-0 rounded-full"
          >
            <Avatar name={profile.name} color={profile.color} avatar={profile.avatar} size={36} />
          </button>
        )}
      </header>

      <p class="hf-label mt-5">Saldo total</p>
      <p class="mt-1.5">
        <Money minor={available} size={44} testId="total-balance" />
      </p>

      {(items.length > 0 || savedThisMonth) && (
        <MonthCard items={items} state={state} today={today} />
      )}

      <PendingEstimates state={state} onConfirm={onConfirm} />

      <QuickActions onExpense={() => onCompose("expense")} onIncome={() => onCompose("income")} />

      {/*
        Secundária e discreta: importar é mensal, lançar é diário. Com o mesmo
        peso das duas ações, disputaria o polegar com elas.
      */}
      <button
        type="button"
        onClick={onImport}
        class="hf-press mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-lg border
          border-divider text-sm text-fg/75 hover:bg-fg/[0.05]"
      >
        <Icon name="file-pdf" size={16} />
        Importar fatura ou extrato
      </button>

      <TransactionList
        items={items}
        state={state}
        today={today}
        currentUserId={profile?.id ?? null}
        onEdit={onEdit}
      />
    </>
  );
}
