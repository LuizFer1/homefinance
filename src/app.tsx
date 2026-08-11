import type { ReadonlySignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { TransactionKind } from "./domain/events/transaction";
import { diffTransaction, type TransactionDraft } from "./domain/events/transaction";
import type { Ulid } from "./domain/ids/ulid";
import { formatBRL } from "./domain/money/money";
import type { TransactionRecord } from "./domain/projections/apply";
import {
  findUser,
  listCategories,
  listPaymentMethods,
  listTransactions,
  totals,
} from "./domain/projections/selectors";
import { DashboardPage } from "./features/dashboard/dashboard-page";
import { Icon } from "./features/icons/icon";
import type { OnboardingStore } from "./features/onboarding/store";
import { OnboardingWizard } from "./features/onboarding/wizard";
import { Avatar } from "./features/profile/avatar-view";
import { ProfilePage } from "./features/profile/profile-page";
import type { ProfileStore } from "./features/profile/store";
import type { RecurrenceStore } from "./features/recurrence/store";
import { RegistryPage } from "./features/registry/registry-page";
import type { RegistryStore } from "./features/registry/store";
import { SettingsPage, type SettingsSection } from "./features/settings/settings-page";
import type { ThemeToggleProps } from "./features/theme/theme-toggle";
import { ThemeToggle } from "./features/theme/theme-toggle";
import type { TransactionsStore } from "./features/transactions/store";
import { TransactionList } from "./features/transactions/transaction-list";
import {
  type RecurrenceInput,
  TransactionWizard,
} from "./features/transactions/transaction-wizard";
import { greetingFor } from "./features/ui/greeting";
import { Modal } from "./features/ui/modal";
import { QuickActions } from "./features/ui/quick-actions";

export interface AppProps {
  store: TransactionsStore;
  registry: RegistryStore;
  profileStore: ProfileStore;
  recurrence: RecurrenceStore;
  onboarding: OnboardingStore;
  /**
   * Só leitura. O App não escreve autoria; passar a `Session` inteira lhe daria
   * um poder que ele não usa. Ler o sinal **dentro** do componente é o que faz o
   * cabeçalho reagir ao perfil recém-criado pelo wizard.
   */
  localUserId: ReadonlySignal<Ulid | null>;
  /** Pipeline da foto já ligado ao canvas. Injetado: `happy-dom` não tem um. */
  processFile: (file: Blob) => Promise<string>;
  onReset: () => void;
  /** Data de hoje em 'YYYY-MM-DD'. Vem de fora para o teste não depender do relógio. */
  today: string;
  /** Hora local 0..23, injetada pelo mesmo motivo que `today`. */
  hour: number;
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
 * lugar.
 *
 * Configurações tem uma sub-tela (a lista de cadastro), guardada num estado
 * próprio em vez de virar um quarto destino: cadastro é manutenção, e uma aba
 * para ele competiria com as três coisas que o usuário realmente faz.
 */
const SCREENS = [
  { id: "dashboard", label: "Dashboard", icon: "piggy-bank" },
  { id: "inicio", label: "Início", icon: "house" },
  { id: "config", label: "Ajustes", icon: "briefcase" },
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

export function App({
  store,
  registry,
  profileStore,
  recurrence,
  onboarding,
  localUserId,
  processFile,
  onReset,
  today,
  hour,
  theme,
}: AppProps) {
  const [editing, setEditing] = useState<TransactionRecord | null>(null);
  const [composing, setComposing] = useState<TransactionKind | null>(null);
  const [screen, setScreen] = useState<ScreenId>("inicio");
  const [section, setSection] = useState<SettingsSection | null>(null);

  useEffect(() => {
    // Materializa depois do init: o boot e o "virar do mês" são o mesmo caminho.
    // Sem isto, o salário de março só existiria se o usuário abrisse a tela de
    // edição da série — o extrato ficaria mentindo por omissão.
    void store.init().then(() => recurrence.materializeDue(today));
  }, [store, recurrence, today]);

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

  // Renderiza **no lugar** do app, não sobre ele: não há tela por trás do wizard
  // que faça sentido sem um autor, e um modal deixaria a lista consultável por
  // baixo dele.
  if (onboarding.needsOnboarding.value) {
    return (
      <Shell>
        <OnboardingWizard onComplete={onboarding.complete} processFile={processFile} />
      </Shell>
    );
  }

  const profile = findUser(store.state.value, localUserId.value);
  const items = listTransactions(store.state.value);
  const summary = totals(items);
  const negative = summary.balanceMinor < 0;
  const categories = listCategories(store.state.value);
  const paymentMethods = listPaymentMethods(store.state.value);

  // Uma condição só para os dois casos: o modal está aberto para criar
  // (`editing` nulo) ou para editar. Dois estados independentes permitiriam
  // abrir os dois ao mesmo tempo.
  const modalOpen = composing !== null || editing !== null;

  function closeModal() {
    setComposing(null);
    setEditing(null);
  }

  function handleSubmit(draft: TransactionDraft, recurrenceRule: RecurrenceInput | null) {
    if (editing === null) {
      if (recurrenceRule !== null) {
        void recurrence.createSeries(draft, recurrenceRule, today);
      } else {
        void store.add(draft);
      }
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

  function goToScreen(id: ScreenId) {
    setScreen(id);
    // Voltar para Ajustes depois sempre cai na raiz, e não na sub-tela de onde
    // o usuário saiu — que ele já não lembra ter deixado aberta.
    setSection(null);
  }

  return (
    <div class={SHELL}>
      {/*
        Cabeçalho translúcido e fixo: o conteúdo corre por baixo dele em vez de
        o chrome comer uma faixa fixa da tela. O saldo é o único número que
        merece ficar sempre visível — em todas as três telas.
      */}
      <header class="hf-material hf-scroll-edge sticky top-0 z-10">
        <div class="mx-auto w-full max-w-md px-5 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h1 class={CAPTION}>{greetingFor(hour, profile?.name)}</h1>
              <p
                data-testid="total-balance"
                class={`hf-display mt-1 text-[2rem] font-semibold ${negative ? "text-error" : ""}`}
              >
                {/* "total" e não só "saldo": o dashboard agora mostra o do mês,
                    e dois números com o mesmo nome na mesma sessão confundem. */}
                <span class="sr-only">Saldo total: </span>
                {formatBRL(summary.balanceMinor)}
              </p>
            </div>
            {/*
              A foto aparece aqui e nas configurações, e **não** na lista de
              lançamentos: lá o autor é a marca lateral colorida, porque o
              dinheiro é o único dado que importa naquela tela.

              O toque abre a edição de perfil de qualquer tela — o atalho
              existe porque mudar foto/nome/cor é o que se espera ao tocar
              no próprio rosto, não um item escondido só em Ajustes.
            */}
            <div class="flex shrink-0 items-center gap-2">
              {profile !== null && (
                <button
                  type="button"
                  aria-label="Editar perfil"
                  class="hf-press hf-tap rounded-full"
                  onClick={() => {
                    setScreen("config");
                    setSection("profile");
                  }}
                >
                  <Avatar name={profile.name} color={profile.color} avatar={profile.avatar} />
                </button>
              )}
              <ThemeToggle storage={theme.storage} doc={theme.doc} />
            </div>
          </div>
        </div>
      </header>

      {/*
        O padding inferior reserva a altura da barra mais o safe area. Sem ele o
        último item da lista fica permanentemente sob a barra, inalcançável.
      */}
      <main class="mx-auto w-full max-w-md px-5 pb-[calc(var(--hf-nav-h)+env(safe-area-inset-bottom)+2rem)]">
        {store.error.value !== null && (
          <p role="alert" class="rounded-box mt-4 bg-error/10 p-3 text-sm text-error">
            {store.error.value}
          </p>
        )}

        {screen === "dashboard" && (
          <DashboardPage items={items} state={store.state.value} today={today} />
        )}

        {screen === "inicio" && (
          <>
            <QuickActions
              actions={[
                {
                  id: "despesa",
                  label: "Despesa",
                  icon: "receipt",
                  tone: "border-error/25 bg-error/10 text-error hover:border-error/45",
                  onSelect: () => setComposing("expense"),
                },
                {
                  id: "receita",
                  label: "Receita",
                  icon: "banknote",
                  tone: "border-success/25 bg-success/10 text-success hover:border-success/45",
                  onSelect: () => setComposing("income"),
                },
              ]}
            />

            <TransactionList
              items={items}
              state={store.state.value}
              today={today}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          </>
        )}

        {screen === "config" &&
          (section === null ? (
            <SettingsPage
              categoryCount={categories.length}
              paymentMethodCount={paymentMethods.length}
              profile={profile}
              onOpen={setSection}
              onReset={onReset}
            />
          ) : section === "profile" ? (
            profile !== null ? (
              <ProfilePage
                profile={profile}
                store={profileStore}
                processFile={processFile}
                onBack={() => setSection(null)}
              />
            ) : null
          ) : (
            <RegistryPage
              entity={section}
              state={store.state.value}
              store={registry}
              onBack={() => setSection(null)}
            />
          ))}
      </main>

      <nav
        aria-label="Seções"
        class="hf-material fixed inset-x-0 bottom-0 z-10 border-t border-base-300/60
          pb-[env(safe-area-inset-bottom)]"
      >
        {/* A altura e do conteudo; o safe area soma por fora, no <nav>. */}
        <div class="mx-auto flex h-[var(--hf-nav-h)] w-full max-w-md">
          {SCREENS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              aria-current={screen === id ? "page" : undefined}
              onClick={() => goToScreen(id)}
              class={`${TAB} ${screen === id ? "text-primary" : "text-base-content/50"}`}
            >
              <Icon name={icon} size={20} />
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
            initialKind={composing ?? undefined}
            categories={categories}
            paymentMethods={paymentMethods}
          />
        )}
      </Modal>
    </div>
  );
}
