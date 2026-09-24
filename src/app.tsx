import type { ReadonlySignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { TransactionKind } from "./domain/events/transaction";
import { diffTransaction, type TransactionDraft } from "./domain/events/transaction";
import type { Ulid } from "./domain/ids/ulid";
import type { TransactionRecord } from "./domain/projections/apply";
import {
  findUser,
  listCategories,
  listPaymentMethods,
  listTransactions,
} from "./domain/projections/selectors";
import { BrandMark } from "./features/brand/brand-mark";
import { cssVarForToken } from "./features/colors/color-token";
import { DashboardPage } from "./features/dashboard/dashboard-page";
import { HomePage } from "./features/home/home-page";
import { Icon } from "./features/icons/icon";
import type { OnboardingStore } from "./features/onboarding/store";
import { OnboardingWizard } from "./features/onboarding/wizard";
import { ProfilePage } from "./features/profile/profile-page";
import type { ProfileStore } from "./features/profile/store";
import type { RecurrenceStore } from "./features/recurrence/store";
import { RegistryPage } from "./features/registry/registry-page";
import type { RegistryStore } from "./features/registry/store";
import { SettingsPage, type SettingsSection } from "./features/settings/settings-page";
import type { ThemeToggleProps } from "./features/theme/theme-toggle";
import type { TransactionsStore } from "./features/transactions/store";
import {
  type RecurrenceInput,
  TransactionWizard,
} from "./features/transactions/transaction-wizard";
import { Modal } from "./features/ui/modal";
import { useSwipeNav } from "./features/ui/use-swipe-nav";

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

const SHELL = "hf-backdrop min-h-dvh text-fg";

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
  { id: "dashboard", label: "Dashboard", icon: "chart-pie-slice" },
  { id: "inicio", label: "Início", icon: "house" },
  { id: "config", label: "Ajustes", icon: "gear-six" },
] as const;

type ScreenId = (typeof SCREENS)[number]["id"];

/** Ordem esquerda → direita do arraste (Dashboard · Início · Ajustes). */
const SCREEN_IDS: readonly ScreenId[] = SCREENS.map((s) => s.id);

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
  // Cor do brilho do topo enquanto o Perfil está aberto: acompanha a cor que a
  // pessoa está escolhendo, antes mesmo de salvar.
  const [glow, setGlow] = useState<string | null>(null);

  useEffect(() => {
    // Materializa depois do init: o boot e o "virar do mês" são o mesmo caminho.
    // Sem isto, o salário de março só existiria se o usuário abrisse a tela de
    // edição da série — o extrato ficaria mentindo por omissão.
    void store.init().then(() => recurrence.materializeDue(today));
  }, [store, recurrence, today]);

  // Uma condição só para os dois casos: o modal está aberto para criar
  // (`editing` nulo) ou para editar. Dois estados independentes permitiriam
  // abrir os dois ao mesmo tempo.
  const modalOpen = composing !== null || editing !== null;

  function goToScreen(id: ScreenId) {
    setScreen(id);
    // Voltar para Ajustes depois sempre cai na raiz, e não na sub-tela de onde
    // o usuário saiu — que ele já não lembra ter deixado aberta.
    setSection(null);
  }

  // Hook antes de qualquer return: arraste só nas três abas raiz. Modal ou
  // sub-tela de Ajustes (perfil/cadastro) desliga o gesto para não trocar de
  // aba no meio de um formulário.
  const swipe = useSwipeNav({
    screens: SCREEN_IDS,
    screen,
    enabled:
      store.status.value === "ready" &&
      !onboarding.needsOnboarding.value &&
      section === null &&
      !modalOpen,
    onChange: goToScreen,
  });

  if (store.status.value === "loading") {
    return (
      <Shell>
        <BrandMark size={44} />
        <p class="mt-4 text-fg/55">Carregando...</p>
      </Shell>
    );
  }

  if (store.status.value === "error") {
    return (
      <Shell>
        <BrandMark size={44} />
        <p role="alert" class="mt-4 rounded-lg bg-expense/10 p-4 text-sm text-expense-fg">
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
      <div class={SHELL}>
        <OnboardingWizard onComplete={onboarding.complete} processFile={processFile} />
      </div>
    );
  }

  const profile = findUser(store.state.value, localUserId.value);
  const items = listTransactions(store.state.value);
  const categories = listCategories(store.state.value);
  const paymentMethods = listPaymentMethods(store.state.value);

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

  function openSection(next: SettingsSection) {
    setScreen("config");
    setSection(next);
    if (next !== "profile") setGlow(null);
  }

  const editingAuthor = editing === null ? null : findUser(store.state.value, editing.userId);

  return (
    <div class={SHELL} style={glow === null ? undefined : { "--hf-glow": cssVarForToken(glow) }}>
      {/*
        O padding inferior reserva a altura da barra mais o safe area. Sem ele o
        último item da lista fica permanentemente sob a barra, inalcançável.
      */}
      <main
        class="hf-swipe mx-auto w-full max-w-md px-5 pt-[max(1.25rem,env(safe-area-inset-top))]
          pb-[calc(var(--hf-nav-h)+env(safe-area-inset-bottom)+2rem)]"
        onPointerDown={swipe.onPointerDown}
        onPointerMove={swipe.onPointerMove}
        onPointerUp={swipe.onPointerUp}
        onPointerCancel={swipe.onPointerCancel}
        data-swiping={swipe["data-swiping"]}
        style={swipe.style}
      >
        {store.error.value !== null && (
          <p role="alert" class="mb-4 rounded-lg bg-expense/10 p-3 text-sm text-expense-fg">
            {store.error.value}
          </p>
        )}

        {screen === "dashboard" && (
          <DashboardPage
            items={items}
            state={store.state.value}
            today={today}
            onGoHome={() => goToScreen("inicio")}
          />
        )}

        {screen === "inicio" && (
          <HomePage
            items={items}
            state={store.state.value}
            profile={profile}
            today={today}
            hour={hour}
            onCompose={setComposing}
            onEdit={setEditing}
            onOpenProfile={() => openSection("profile")}
          />
        )}

        {screen === "config" &&
          (section === null ? (
            <SettingsPage
              categoryCount={categories.length}
              paymentMethodCount={paymentMethods.length}
              profile={profile}
              theme={theme}
              onOpen={openSection}
              onReset={onReset}
            />
          ) : section === "profile" ? (
            profile !== null ? (
              <ProfilePage
                profile={profile}
                store={profileStore}
                processFile={processFile}
                onColorPreview={setGlow}
                onBack={() => {
                  setGlow(null);
                  setSection(null);
                }}
              />
            ) : null
          ) : (
            <RegistryPage
              entity={section}
              state={store.state.value}
              items={items}
              today={today}
              store={registry}
              onBack={() => setSection(null)}
            />
          ))}
      </main>

      {/*
        Barra de abas: 80px com 18 de área segura desenhada. Fundo em degradê do
        `bg` a 80% para o `bg` cheio — a lista passa por baixo e some, em vez de
        ser cortada por uma faixa opaca. Régua superior esmaecida nas pontas.
      */}
      <nav
        aria-label="Seções"
        class="fixed inset-x-0 bottom-0 z-10 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--color-bg)_80%,transparent),var(--color-bg)_45%)]
          pb-[max(1.125rem,env(safe-area-inset-bottom))]"
      >
        <div aria-hidden="true" class="hf-rule-both absolute inset-x-0 top-0" />
        <div class="mx-auto grid h-[var(--hf-nav-h)] w-full max-w-md grid-cols-3 px-3">
          {SCREENS.map(({ id, label, icon }) => {
            const active = screen === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => goToScreen(id)}
                class={`hf-press relative flex flex-col items-center justify-center gap-[3px]
                  text-[11px] font-medium ${active ? "text-accent-300" : "text-fg/55"}`}
              >
                <span
                  aria-hidden="true"
                  class={`absolute top-0 h-0.5 w-[22px] rounded-full transition-colors duration-200 ${
                    active ? "bg-accent shadow-[0_0_12px_var(--color-accent)]" : "bg-transparent"
                  }`}
                />
                <Icon name={icon} size={24} weight={active ? "fill" : "regular"} />
                {label}
              </button>
            );
          })}
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
            author={
              editingAuthor === null
                ? null
                : { name: editingAuthor.name, color: editingAuthor.color }
            }
            onDelete={editing === null ? undefined : () => handleDelete(editing.id)}
            onManageCategories={() => {
              closeModal();
              openSection("category");
            }}
          />
        )}
      </Modal>
    </div>
  );
}
