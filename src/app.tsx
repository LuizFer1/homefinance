import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { diffTransaction, type TransactionDraft } from "./domain/events/transaction";
import type { Ulid } from "./domain/ids/ulid";
import { formatBRL } from "./domain/money/money";
import type { TransactionRecord } from "./domain/projections/apply";
import {
  listCategories,
  listPaymentMethods,
  listTransactions,
  totals,
} from "./domain/projections/selectors";
import { RegistryPage } from "./features/registry/registry-page";
import type { RegistryStore } from "./features/registry/store";
import type { ThemeToggleProps } from "./features/theme/theme-toggle";
import { ThemeToggle } from "./features/theme/theme-toggle";
import type { TransactionsStore } from "./features/transactions/store";
import { TransactionList } from "./features/transactions/transaction-list";
import { TransactionWizard } from "./features/transactions/transaction-wizard";
import { Modal } from "./features/ui/modal";

export interface AppProps {
  store: TransactionsStore;
  registry: RegistryStore;
  /** Data de hoje em 'YYYY-MM-DD'. Vem de fora para o teste não depender do relógio. */
  today: string;
  /** `localStorage` e `document` vêm de fora pelo mesmo motivo que o relógio. */
  theme: ThemeToggleProps;
}

const SHELL = "min-h-dvh bg-base-200 text-base-content";
const CAPTION = "hf-caption text-[0.6875rem] font-semibold uppercase text-base-content/45";

/**
 * Navegação sem router.
 *
 * Uma dependência de roteamento para três destinos não se paga contra o teto de
 * bundle, e não há URL a preservar: o app é local-first e abre sempre no mesmo
 * lugar. A fatia de configurações acrescenta a quarta entrada aqui.
 *
 * Nenhuma aba é gasta com "novo lançamento" — a ação vive no botão flutuante, que
 * é o que a torna alcançável com o polegar sem competir com os destinos.
 */
const SCREENS = [
  { id: "lancamentos", label: "Início" },
  { id: "categorias", label: "Categorias" },
  { id: "pagamentos", label: "Pagamentos" },
] as const;

type ScreenId = (typeof SCREENS)[number]["id"];

const TAB =
  "hf-press flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium " +
  "transition-colors duration-150";

function Shell({ children }: { children: ComponentChildren }) {
  return (
    <div class={SHELL}>
      <main class="mx-auto w-full max-w-md px-5 py-16">{children}</main>
    </div>
  );
}

export function App({ store, registry, today, theme }: AppProps) {
  const [editing, setEditing] = useState<TransactionRecord | null>(null);
  const [composing, setComposing] = useState(false);
  const [screen, setScreen] = useState<ScreenId>("lancamentos");

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
  const categories = listCategories(store.state.value);
  const paymentMethods = listPaymentMethods(store.state.value);

  // Uma condição só para os dois casos: o modal está aberto para criar
  // (`editing` nulo) ou para editar. Dois estados independentes permitiriam
  // abrir os dois ao mesmo tempo.
  const modalOpen = composing || editing !== null;

  function closeModal() {
    setComposing(false);
    setEditing(null);
  }

  function handleSubmit(draft: TransactionDraft) {
    if (editing === null) {
      void store.add(draft);
      closeModal();
      return;
    }

    const patch = diffTransaction(editing, draft);
    // Patch vazio não vira evento: um log append-only não merece lixo permanente.
    if (Object.keys(patch).length > 0) void store.edit(editing.id, patch);
    closeModal();
  }

  function handleDelete(entityId: Ulid) {
    if (editing?.id === entityId) closeModal();
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

      {/*
        O padding inferior reserva a altura da barra mais o safe area. Sem ele o
        último item da lista fica permanentemente sob a barra, inalcançável.
      */}
      <main class="mx-auto w-full max-w-md px-5 pb-[calc(var(--hf-nav-h)+env(safe-area-inset-bottom)+5rem)]">
        {store.error.value !== null && (
          <p role="alert" class="rounded-box mt-4 bg-error/10 p-3 text-sm text-error">
            {store.error.value}
          </p>
        )}

        {screen !== "lancamentos" && (
          <RegistryPage
            entity={screen === "categorias" ? "category" : "paymentMethod"}
            state={store.state.value}
            store={registry}
          />
        )}

        {screen === "lancamentos" && (
          <>
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

            <TransactionList
              items={items}
              state={store.state.value}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          </>
        )}
      </main>

      {/*
        Botão flutuante acima da barra, à direita: é a zona que o polegar alcança
        sem reposicionar a mão. Só aparece na tela de lançamentos — nas telas de
        cadastro a ação principal é outra, e o botão ali abriria a coisa errada.
      */}
      {screen === "lancamentos" && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          aria-label="Novo lançamento"
          class="hf-press fixed right-[max(1.25rem,calc(50vw-13rem))]
            bottom-[calc(var(--hf-nav-h)+env(safe-area-inset-bottom)+1rem)] z-20 flex size-14
            items-center
            justify-center rounded-full bg-primary text-2xl leading-none text-primary-content
            shadow-lg"
        >
          +
        </button>
      )}

      <nav
        aria-label="Seções"
        class="hf-material fixed inset-x-0 bottom-0 z-10 border-t border-base-300/60
          pb-[env(safe-area-inset-bottom)]"
      >
        {/* A altura e do conteudo; o safe area soma por fora, no <nav>. */}
        <div class="mx-auto flex h-[var(--hf-nav-h)] w-full max-w-md">
          {SCREENS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-current={screen === id ? "page" : undefined}
              onClick={() => setScreen(id)}
              class={`${TAB} ${screen === id ? "text-primary" : "text-base-content/50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <Modal
        open={modalOpen}
        title={editing === null ? "Novo lançamento" : "Editar lançamento"}
        onClose={closeModal}
      >
        {/*
          Montada só enquanto aberta, com `key` derivada do registro: trocar de
          registro remonta a wizard e os inicializadores de `useState` releem as
          props. Um `useEffect` de reset rodaria depois do DOM ficar consultável
          e sobrescreveria o que o usuário já digitou.
        */}
        {modalOpen && (
          <TransactionWizard
            key={editing?.id ?? "novo"}
            editing={editing}
            onSubmit={handleSubmit}
            onCancel={closeModal}
            today={today}
            categories={categories}
            paymentMethods={paymentMethods}
          />
        )}
      </Modal>
    </div>
  );
}
