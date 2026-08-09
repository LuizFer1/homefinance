import { useEffect, useState } from "preact/hooks";
import { diffTransaction, type TransactionDraft } from "./domain/events/transaction";
import type { Ulid } from "./domain/ids/ulid";
import { formatBRL } from "./domain/money/money";
import type { TransactionRecord } from "./domain/projections/apply";
import { listTransactions, totals } from "./domain/projections/selectors";
import type { TransactionsStore } from "./features/transactions/store";
import { TransactionForm } from "./features/transactions/transaction-form";
import { TransactionList } from "./features/transactions/transaction-list";

export interface AppProps {
  store: TransactionsStore;
  /** Data de hoje em 'YYYY-MM-DD'. Vem de fora para o teste não depender do relógio. */
  today: string;
}

export function App({ store, today }: AppProps) {
  const [editing, setEditing] = useState<TransactionRecord | null>(null);

  useEffect(() => {
    void store.init();
  }, [store]);

  if (store.status.value === "loading") {
    return (
      <main>
        <h1>HomeFinance</h1>
        <p>Carregando...</p>
      </main>
    );
  }

  if (store.status.value === "error") {
    return (
      <main>
        <h1>HomeFinance</h1>
        <p role="alert">Não foi possível abrir o armazenamento local: {store.error.value}</p>
      </main>
    );
  }

  const items = listTransactions(store.state.value);
  const summary = totals(items);

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
    <main>
      <h1>HomeFinance</h1>

      {store.error.value !== null && <p role="alert">{store.error.value}</p>}

      <section aria-label="Totais">
        <p data-testid="total-income">Receitas: {formatBRL(summary.incomeMinor)}</p>
        <p data-testid="total-expense">Despesas: {formatBRL(summary.expenseMinor)}</p>
        <p data-testid="total-balance">Saldo: {formatBRL(summary.balanceMinor)}</p>
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
  );
}
