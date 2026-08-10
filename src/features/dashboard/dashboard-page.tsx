import { formatBRL } from "../../domain/money/money";
import type { Totals } from "../../domain/projections/selectors";

export interface DashboardPageProps {
  totals: Totals;
  /** Quantos lançamentos visíveis existem, para distinguir vazio de zerado. */
  count: number;
}

const CARD = "rounded-box border border-base-content/10 bg-base-100/60 px-4 py-3";
const CAPTION = "hf-caption text-[0.6875rem] font-semibold uppercase text-base-content/45";

/**
 * Dashboard mínimo: os números que a projeção já entrega.
 *
 * Nasce pequeno de propósito. Gasto por categoria, receita contra despesa no
 * tempo e gasto por forma de pagamento são a fatia própria do dashboard; o
 * recorte por autor depende da autoria, que é a fatia de perfil, e só ganha
 * sentido pleno com o sync entre aparelhos.
 */
export function DashboardPage({ totals, count }: DashboardPageProps) {
  const negative = totals.balanceMinor < 0;

  return (
    <section aria-label="Dashboard">
      <h2 class={`${CAPTION} mt-4`}>Resumo</h2>

      {count === 0 ? (
        <p class="rounded-box mt-3 border border-base-content/10 bg-base-100/60 px-4 py-10 text-center text-sm text-base-content/45">
          Nenhum lançamento ainda. Registre o primeiro em Início.
        </p>
      ) : (
        <>
          <div class={`${CARD} mt-3`}>
            <p class={CAPTION}>Saldo do período</p>
            <p
              data-testid="dashboard-balance"
              class={`hf-display mt-1 text-[1.75rem] font-semibold ${negative ? "text-error" : ""}`}
            >
              {formatBRL(totals.balanceMinor)}
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
                {formatBRL(totals.incomeMinor)}
              </p>
            </div>
            <div class={CARD}>
              <p class={CAPTION}>Despesas</p>
              <p data-testid="total-expense" class="hf-num mt-0.5 font-semibold">
                {formatBRL(totals.expenseMinor)}
              </p>
            </div>
          </div>

          <p class="mt-3 text-xs text-base-content/40">
            {count} {count === 1 ? "lançamento" : "lançamentos"} no período.
          </p>
        </>
      )}
    </section>
  );
}
