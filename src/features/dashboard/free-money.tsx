import type { FreeMoney } from "../../domain/projections/free-money";
import { brl, Money } from "../ui/money";
import { monthWord } from "./parts";

/**
 * "Dinheiro livre mês que vem": o que sobra das entradas recorrentes depois das
 * saídas recorrentes.
 *
 * A barra é neutra, sem verde nem vermelho: ela mostra uma proporção (quanto das
 * entradas já tem destino), não um julgamento. Vermelho aqui fica só para o
 * número quando ele fecha negativo. O `aria-label` da barra carrega só a
 * porcentagem, para não ler o que "Ocultar valores" esconde.
 */
export function FreeMoneyCard({ free }: { free: FreeMoney }) {
  const committed = free.incomeMinor > 0 ? Math.min(1, free.expenseMinor / free.incomeMinor) : 1;

  return (
    <section aria-label="Dinheiro livre mês que vem" class="rounded-lg bg-surface p-4">
      <h3 class="text-sm text-fg/60">Livre em {monthWord(free.month)}</h3>
      <p class="mt-2 flex flex-wrap items-baseline gap-x-2">
        {free.estimated && (
          <>
            <span class="sr-only">aproximadamente </span>
            <span aria-hidden="true">~</span>
          </>
        )}
        <Money
          minor={free.freeMinor}
          size={28}
          testId="free-money"
          class={free.freeMinor < 0 ? "text-expense-fg" : ""}
        />
        {free.incomeMinor > 0 && (
          <span data-testid="free-money-of" class="hf-num text-sm text-fg/55">
            de {brl(free.incomeMinor)}
          </span>
        )}
      </p>
      <div
        role="img"
        aria-label={`${Math.round(committed * 100)}% das entradas recorrentes já comprometidos`}
        class="mt-4 h-2 overflow-hidden rounded-full bg-neutral-800"
      >
        <span
          class="block h-full rounded-full bg-neutral-500"
          style={{ width: `${committed * 100}%` }}
        />
      </div>
      <p data-testid="free-money-expense" class="hf-num mt-2 text-xs text-fg/55">
        {brl(free.expenseMinor)} já comprometido
      </p>
      {free.estimated && (
        <p class="mt-1 text-xs text-fg/55 text-pretty">
          Inclui a estimativa de contas com valor variável
        </p>
      )}
    </section>
  );
}
