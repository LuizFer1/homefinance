import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { diffTransaction, type TransactionDraft } from "./domain/events/transaction";
import type { Ulid } from "./domain/ids/ulid";
import { formatBRL } from "./domain/money/money";
import type { TransactionRecord } from "./domain/projections/apply";
import { listTransactions, totals } from "./domain/projections/selectors";
import type { ThemeToggleProps } from "./features/theme/theme-toggle";
import { ThemeToggle } from "./features/theme/theme-toggle";
import type { TransactionsStore } from "./features/transactions/store";
import { TransactionForm } from "./features/transactions/transaction-form";
import { TransactionList } from "./features/transactions/transaction-list";

export interface AppProps {
  store: TransactionsStore;
  /** Data de hoje em 'YYYY-MM-DD'. Vem de fora para o teste não depender do relógio. */
  today: string;
  /** `localStorage` e `document` vêm de fora pelo mesmo motivo que o relógio. */
  theme: ThemeToggleProps;
}

const SHELL = "min-h-dvh bg-base-200 text-base-content";
const CAPTION = "hf-caption text-[0.6875rem] font-semibold uppercase text-base-content/45";

function Shell({ children }: { children: ComponentChildren }) {
  return (
    <div class={SHELL}>
      <main class="mx-auto w-full max-w-md px-5 py-16">{children}</main>
    </div>
  );
}

export function App({ store, today, theme }: AppProps) {
  const [editing, setEditing] = useState<TransactionRecord | null>(null);

  useEffect(() => {
    void store.init();
  }, [store]);

  if (store.status.value === "loading") {
    return (
      <Shell>
        <h1 class={CAPTION}>HomeFinance</h1>
        <p class="mt-2 text-base-content/50">Carregando...</p>
      </Shell>
    );
  }

  if (store.status.value === "error") {
    return (
      <Shell>
        <h1 class={CAPTION}>HomeFinance</h1>
        <p role="alert" class="rounded-box mt-3 bg-error/10 p-4 text-sm text-error">
          Não foi possível abrir o armazenamento local: {store.error.value}
        </p>
      </Shell>
    );
  }

  const items = listTransactions(store.state.value);
  const summary = totals(items);
  const negative = summary.balanceMinor < 0;

  function handleSubmit(draft: TransactionDraft) {
    if (editing === null) {
      void store.add(draft);
      return;
    }

    const patch = diffTransaction(editing, draft);
    // Patch vazio não vira evento: um log append-only não merece lixo permanente.
    if (Object.keys(patch).length > 0) void store.edit(editing.id, patch);
    setEditing(null);
  }

  function handleDelete(entityId: Ulid) {
    if (editing?.id === entityId) setEditing(null);
    void store.remove(entityId);
  }

  return (
    <div class={SHELL}>
      {/*
        Cabeçalho translúcido e fixo: o conteúdo corre por baixo dele em vez de
        o chrome comer uma faixa fixa da tela. O saldo é o único número que
        merece ficar sempre visível — receitas e despesas são detalhamento.
      */}
      <header class="hf-material hf-scroll-edge sticky top-0 z-10">
        <div class="mx-auto w-full max-w-md px-5 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h1 class={CAPTION}>HomeFinance</h1>
              <p
                data-testid="total-balance"
                class={`hf-display mt-1 text-[2rem] font-semibold ${negative ? "text-error" : ""}`}
              >
                <span class="sr-only">Saldo: </span>
                {formatBRL(summary.balanceMinor)}
              </p>
            </div>
            <ThemeToggle storage={theme.storage} doc={theme.doc} />
          </div>
        </div>
      </header>

      <main class="mx-auto w-full max-w-md px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {store.error.value !== null && (
          <p role="alert" class="rounded-box mt-4 bg-error/10 p-3 text-sm text-error">
            {store.error.value}
          </p>
        )}

        {/*
          Os rotulos ja dizem o que cada numero e, entao cor aqui seria
          decorativa. Ela fica reservada para onde e o unico portador de
          significado: o saldo negativo e o sinal de receita na lista.
        */}
        <section aria-label="Totais" class="mt-4 grid grid-cols-2 gap-3">
          <div class="rounded-box bg-base-100 px-4 py-3">
            <p class={CAPTION}>Receitas</p>
            <p data-testid="total-income" class="hf-num mt-0.5 font-semibold">
              {formatBRL(summary.incomeMinor)}
            </p>
          </div>
          <div class="rounded-box bg-base-100 px-4 py-3">
            <p class={CAPTION}>Despesas</p>
            <p data-testid="total-expense" class="hf-num mt-0.5 font-semibold">
              {formatBRL(summary.expenseMinor)}
            </p>
          </div>
        </section>

        <TransactionForm
          key={editing?.id ?? "novo"}
          editing={editing}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
          today={today}
        />

        <TransactionList items={items} onEdit={setEditing} onDelete={handleDelete} />
      </main>
    </div>
  );
}
