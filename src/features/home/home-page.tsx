import type { AppState } from "../../domain/model/app-state";
import type { Transaction, TransactionKind } from "../../domain/model/transaction";
import type { User } from "../../domain/model/user";
import { filterByMonth } from "../../domain/projections/breakdown";
import { monthLabelLong, monthOf } from "../../domain/projections/periods";
import { totals } from "../../domain/projections/selectors";
import { Avatar } from "../profile/avatar-view";
import { TransactionList } from "../transactions/transaction-list";
import { greetingFor } from "../ui/greeting";
import { MINUS, Money, moneyParts } from "../ui/money";
import { QuickActions } from "../ui/quick-actions";

export interface HomePageProps {
  items: Transaction[];
  state: AppState;
  profile: User | null;
  today: string;
  hour: number;
  onCompose: (kind: TransactionKind) => void;
  onEdit: (record: Transaction) => void;
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
function MonthCard({ items, today }: { items: Transaction[]; today: string }) {
  const month = monthOf(today);
  const summary = totals(filterByMonth(items, month));
  const moved = summary.incomeMinor + summary.expenseMinor;

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
  onEdit,
  onOpenProfile,
}: HomePageProps) {
  const summary = totals(items);

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
        <Money minor={summary.balanceMinor} size={44} testId="total-balance" />
      </p>

      {items.length > 0 && <MonthCard items={items} today={today} />}

      <QuickActions onExpense={() => onCompose("expense")} onIncome={() => onCompose("income")} />

      <TransactionList items={items} state={state} today={today} onEdit={onEdit} />
    </>
  );
}
