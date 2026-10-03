import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Ulid } from "./domain/ids/ulid";
import { isAlive } from "./domain/model/base";
import type { RecurrenceRule } from "./domain/model/recurrence";
import type { ReserveKind, ReserveMovement } from "./domain/model/reserve";
import type { Transaction, TransactionDraft, TransactionKind } from "./domain/model/transaction";
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
import { ImportSheet } from "./features/import/import-sheet";
import type { ReadPdf } from "./features/import/read-pdf";
import type { ImportStore } from "./features/import/store";
import type { OnboardingStore } from "./features/onboarding/store";
import { OnboardingWizard } from "./features/onboarding/wizard";
import { ProfilePage } from "./features/profile/profile-page";
import type { ProfileStore } from "./features/profile/store";
import { AdjustSheet } from "./features/recurrence/adjust-sheet";
import { ConfirmSheet } from "./features/recurrence/confirm-sheet";
import type { RecurrenceStore } from "./features/recurrence/store";
import { RegistryPage } from "./features/registry/registry-page";
import type { RegistryStore } from "./features/registry/store";
import { DepositSheet } from "./features/reserves/deposit-sheet";
import { ReserveDetail } from "./features/reserves/reserve-detail";
import { ReserveForm } from "./features/reserves/reserve-form";
import { ReservesPage } from "./features/reserves/reserves-page";
import type { ReservesStore } from "./features/reserves/store";
import { WithdrawSheet } from "./features/reserves/withdraw-sheet";
import { ignoreHandled, type Session } from "./features/session/session";
import { SettingsPage, type SettingsSection } from "./features/settings/settings-page";
import { HubPage } from "./features/sync/hub-page";
import type { SyncStore } from "./features/sync/store";
import type { ThemeToggleProps } from "./features/theme/theme-toggle";
import type { TransactionsStore } from "./features/transactions/store";
import { TransactionWizard } from "./features/transactions/transaction-wizard";
import { Modal } from "./features/ui/modal";
import { useSwipeNav } from "./features/ui/use-swipe-nav";
import type { UpdateStore } from "./features/update/store";
import { UpdateBanner } from "./features/update/update-banner";

export interface AppProps {
  /**
   * Estado, status, erro e boot. O App só lê a sessão e chama `init`; toda
   * escrita passa pelas stores. Ler `localUserId` **dentro** do componente é o
   * que faz o cabeçalho reagir ao perfil recém-criado pelo wizard.
   */
  session: Session;
  store: TransactionsStore;
  registry: RegistryStore;
  profileStore: ProfileStore;
  recurrence: RecurrenceStore;
  reserves: ReservesStore;
  onboarding: OnboardingStore;
  importer: ImportStore;
  /** Versão nova do app esperando a pessoa aceitar. */
  update: UpdateStore;
  sync: SyncStore;
  /** Sugestão para "Nome deste aparelho" ao parear (`guessDeviceName`). */
  deviceNameGuess: string;
  /** Leitor de PDF sob demanda. Injetado: o `happy-dom` não roda o pdf.js. */
  readPdf: ReadPdf;
  /** Pipeline da foto já ligado ao canvas. Injetado: `happy-dom` não tem um. */
  processFile: (file: Blob) => Promise<string>;
  /** Rejeita se o banco não apagou; a tela de reset mostra o motivo. */
  onReset: () => Promise<void>;
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
 * Uma dependência de roteamento para quatro destinos não se paga contra o teto
 * de bundle, e não há URL a preservar: o app é local-first e abre sempre no
 * mesmo lugar.
 *
 * Reservas ganhou aba própria porque guardar e retirar é algo que a pessoa faz
 * todo mês, como lançar uma despesa. Já o cadastro de Configurações é
 * manutenção: fica numa sub-tela guardada em estado próprio, e uma aba para ele
 * competiria com as coisas que o usuário realmente faz. O detalhe e o
 * formulário de uma reserva seguem a mesma regra — sub-telas, não destinos.
 */
const SCREENS = [
  { id: "dashboard", label: "Dashboard", icon: "chart-pie-slice" },
  { id: "inicio", label: "Início", icon: "house" },
  { id: "reservas", label: "Reservas", icon: "vault" },
  { id: "config", label: "Ajustes", icon: "gear-six" },
] as const;

type ScreenId = (typeof SCREENS)[number]["id"];

/** Ordem esquerda → direita do arraste (Dashboard · Início · Reservas · Ajustes). */
const SCREEN_IDS: readonly ScreenId[] = SCREENS.map((s) => s.id);

/** Sub-tela da aba Reservas. */
type ReserveView =
  | { kind: "list" }
  | { kind: "detail"; id: Ulid }
  | { kind: "form"; id: Ulid | null; initialKind: ReserveKind };

/** Sheet de movimento aberto: o tipo decide o sheet, `editing` nulo é um movimento novo. */
type ReserveSheet =
  | { kind: "deposit"; reserveId: Ulid; editing: ReserveMovement | null }
  | { kind: "withdraw"; reserveId: Ulid; editing: ReserveMovement | null };

const RESERVE_LIST: ReserveView = { kind: "list" };

function reserveSheetTitle(sheet: ReserveSheet | null): string {
  if (sheet?.kind === "withdraw") return sheet.editing === null ? "Retirar" : "Editar retirada";
  return sheet?.editing ? "Editar guardado" : "Guardar";
}

function Shell({ children }: { children: ComponentChildren }) {
  return (
    <div class={SHELL}>
      <main class="mx-auto w-full max-w-md px-5 py-16">{children}</main>
    </div>
  );
}

export function App({
  session,
  store,
  registry,
  profileStore,
  recurrence,
  reserves,
  onboarding,
  importer,
  update,
  sync,
  deviceNameGuess,
  readPdf,
  processFile,
  onReset,
  today,
  hour,
  theme,
}: AppProps) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [composing, setComposing] = useState<TransactionKind | null>(null);
  const [screen, setScreen] = useState<ScreenId>("inicio");
  const [section, setSection] = useState<SettingsSection | null>(null);
  const [importing, setImporting] = useState(false);
  // Série em reajuste, ou null. Aberto a partir de uma ocorrência no
  // assistente, que fecha antes: dois <dialog> modais empilhados disputariam
  // o foco e o Esc.
  const [adjusting, setAdjusting] = useState<Ulid | null>(null);
  // Estimativa em confirmação, ou null. Aberta pelo bloco "A confirmar".
  const [confirming, setConfirming] = useState<Transaction | null>(null);
  // Cor do brilho do topo enquanto o Perfil está aberto: acompanha a cor que a
  // pessoa está escolhendo, antes mesmo de salvar.
  const [glow, setGlow] = useState<string | null>(null);
  const [reserveView, setReserveView] = useState<ReserveView>(RESERVE_LIST);
  const [reserveSheet, setReserveSheet] = useState<ReserveSheet | null>(null);

  // Reserva apagada por baixo (sync, outra aba) enquanto o detalhe, o
  // formulário ou um sheet dela estava aberto. O render já mostra a lista
  // nesse caso; o efeito só alinha o estado, para o arraste voltar a
  // funcionar e o detalhe não ressuscitar se a linha for revivida depois.
  const reservesById = session.state.value.reserves;
  const viewedReserveId = reserveView.kind === "list" ? null : reserveView.id;
  const viewedReserveGone = viewedReserveId !== null && !isAlive(reservesById[viewedReserveId]);
  const sheetReserveGone = reserveSheet !== null && !isAlive(reservesById[reserveSheet.reserveId]);
  useEffect(() => {
    if (viewedReserveGone) setReserveView(RESERVE_LIST);
  }, [viewedReserveGone]);
  useEffect(() => {
    if (sheetReserveGone) setReserveSheet(null);
  }, [sheetReserveGone]);

  useEffect(() => {
    // Materializa depois do init: o boot e o "virar do mês" são o mesmo caminho.
    // Sem isto, o salário de março só existiria se o usuário abrisse a tela de
    // edição da série — o extrato ficaria mentindo por omissão.
    //
    // Depois, a ligação com o hub vem do disco e, se existir, a primeira rodada
    // é automática (com throttle e silenciosa); o `afterPull` da store
    // materializa de novo o que uma série recebida trouxer. A falha da
    // materialização (já em `session.error`) não pode deixar o hub sem ler.
    //
    // Recorrências antes das reservas: o salário recorrente materializado
    // primeiro é o que dá saldo ao mês para o depósito mensal sair dele.
    void session
      .init()
      .then(() => recurrence.materializeDue(today).catch(ignoreHandled))
      .then(() => reserves.materializeDue(today).catch(ignoreHandled))
      .then(() => sync.init())
      .then(() => sync.sync({ auto: true }))
      .catch(ignoreHandled);
  }, [session, recurrence, reserves, sync, today]);

  // Deep link do QR: espera a sessão e o primeiro uso, porque o pareamento
  // manda o perfil local e o wizard ainda não o criou.
  const deepLink = sync.pendingDeepLink.value;
  const canPair = session.status.value === "ready" && !onboarding.needsOnboarding.value;
  useEffect(() => {
    if (deepLink === null || !canPair) return;
    setScreen("config");
    setSection("hub");
  }, [deepLink, canPair]);

  // Uma condição só para os dois casos: o modal está aberto para criar
  // (`editing` nulo) ou para editar. Dois estados independentes permitiriam
  // abrir os dois ao mesmo tempo.
  const modalOpen = composing !== null || editing !== null;

  function goToScreen(id: ScreenId) {
    setScreen(id);
    // Voltar para Ajustes depois sempre cai na raiz, e não na sub-tela de onde
    // o usuário saiu — que ele já não lembra ter deixado aberta. Vale igual
    // para o detalhe ou o formulário de uma reserva.
    setSection(null);
    setReserveView(RESERVE_LIST);
  }

  // Hook antes de qualquer return: arraste só nas abas raiz. Modal, sheet ou
  // sub-tela (perfil/cadastro em Ajustes, detalhe/formulário em Reservas)
  // desliga o gesto para não trocar de aba no meio de um formulário.
  const swipe = useSwipeNav({
    screens: SCREEN_IDS,
    screen,
    enabled:
      session.status.value === "ready" &&
      !onboarding.needsOnboarding.value &&
      section === null &&
      !modalOpen &&
      !importing &&
      reserveView.kind === "list" &&
      reserveSheet === null,
    onChange: goToScreen,
  });

  if (session.status.value === "loading") {
    return (
      <Shell>
        <BrandMark size={44} />
        <p class="mt-4 text-fg/55">Carregando...</p>
      </Shell>
    );
  }

  if (session.status.value === "error") {
    return (
      <Shell>
        <BrandMark size={44} />
        <p role="alert" class="mt-4 rounded-lg bg-expense/10 p-4 text-sm text-expense-fg">
          Não foi possível abrir o armazenamento local: {session.error.value}
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

  const state = session.state.value;
  const profile = findUser(state, session.localUserId.value);
  const items = listTransactions(state);
  const categories = listCategories(state);
  const paymentMethods = listPaymentMethods(state);

  function closeModal() {
    setComposing(null);
    setEditing(null);
  }

  // Escritas fire-and-forget: a falha já aparece pelo `session.error`, no
  // alerta logo abaixo do cabeçalho; `ignoreHandled` só evita a rejeição solta.
  function handleSubmit(draft: TransactionDraft, recurrenceRule: RecurrenceRule | null) {
    if (editing === null) {
      if (recurrenceRule !== null) {
        void recurrence.createSeries(draft, recurrenceRule, today).catch(ignoreHandled);
      } else {
        void store.add(draft).catch(ignoreHandled);
      }
      closeModal();
      return;
    }

    // O draft vai inteiro: o repositório não grava quando nada mudou.
    void store.edit(editing.id, draft).catch(ignoreHandled);
    closeModal();
  }

  function handleDelete(id: Ulid) {
    if (editing?.id === id) closeModal();
    void store.remove(id).catch(ignoreHandled);
  }

  function openSection(next: SettingsSection) {
    setScreen("config");
    setSection(next);
    if (next !== "profile") setGlow(null);
  }

  function closeReserveSheet() {
    setReserveSheet(null);
  }

  // O sinal do movimento decide o sheet: retirada tem motivo, guardado não.
  function openMovement(movement: ReserveMovement) {
    setReserveSheet({
      kind: movement.amountMinor < 0 ? "withdraw" : "deposit",
      reserveId: movement.reserveId,
      editing: movement,
    });
  }

  const viewedReserve = viewedReserveId === null ? null : (reservesById[viewedReserveId] ?? null);
  const sheetReserve =
    reserveSheet === null || sheetReserveGone
      ? null
      : (reservesById[reserveSheet.reserveId] ?? null);

  function renderReserves() {
    if (reserveView.kind === "detail" && !viewedReserveGone) {
      const id = reserveView.id;
      return (
        <ReserveDetail
          key={id}
          state={state}
          reserveId={id}
          today={today}
          onBack={() => setReserveView(RESERVE_LIST)}
          onEdit={() =>
            setReserveView({ kind: "form", id, initialKind: viewedReserve?.kind ?? "goal" })
          }
          onDeposit={() => setReserveSheet({ kind: "deposit", reserveId: id, editing: null })}
          onWithdraw={() => setReserveSheet({ kind: "withdraw", reserveId: id, editing: null })}
          onOpenMovement={openMovement}
        />
      );
    }
    if (reserveView.kind === "form" && !viewedReserveGone) {
      const id = reserveView.id;
      return (
        <ReserveForm
          key={id ?? "nova"}
          state={state}
          today={today}
          editing={id === null ? null : viewedReserve}
          initialKind={reserveView.initialKind}
          onSubmit={(input) => {
            if (id === null) {
              setReserveView(RESERVE_LIST);
              void reserves.create(input, today).catch(ignoreHandled);
            } else {
              setReserveView({ kind: "detail", id });
              void reserves.edit(id, input, today).catch(ignoreHandled);
            }
          }}
          onDelete={() => {
            setReserveView(RESERVE_LIST);
            if (id !== null) void reserves.remove(id, today).catch(ignoreHandled);
          }}
          onCancel={() => setReserveView(id === null ? RESERVE_LIST : { kind: "detail", id })}
        />
      );
    }
    return (
      <ReservesPage
        state={state}
        today={today}
        onOpen={(id) => setReserveView({ kind: "detail", id })}
        onNew={(kind) => setReserveView({ kind: "form", id: null, initialKind: kind })}
        onCreateEmergency={(multiple, essentialOverrideMinor) => {
          void reserves
            .create(
              {
                kind: "emergency",
                name: "",
                icon: "lifebuoy",
                color: "violet",
                targetMinor: null,
                multiple,
                essentialOverrideMinor,
                deadline: null,
                recurringAmountMinor: null,
              },
              today,
            )
            .catch(ignoreHandled);
        }}
      />
    );
  }

  const editingAuthor = editing === null ? null : findUser(state, editing.userId);
  const editingSeriesId = editing?.recurrenceId ?? null;
  // Variável não tem reajuste (a estimativa é a média) nem volta a ser fixa:
  // as duas ações só existem na ocorrência de série fixa.
  const editingSeriesFixed =
    editingSeriesId !== null && state.recurrences[editingSeriesId]?.variable !== true;

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
        {update.ready.value && <UpdateBanner onApply={update.apply} />}

        {session.error.value !== null && (
          <p role="alert" class="mb-4 rounded-lg bg-expense/10 p-3 text-sm text-expense-fg">
            {session.error.value}
          </p>
        )}

        {screen === "dashboard" && (
          <DashboardPage
            items={items}
            state={state}
            today={today}
            onGoHome={() => goToScreen("inicio")}
          />
        )}

        {screen === "inicio" && (
          <HomePage
            items={items}
            state={state}
            profile={profile}
            today={today}
            hour={hour}
            onCompose={setComposing}
            onImport={() => setImporting(true)}
            onEdit={setEditing}
            onConfirm={setConfirming}
            onOpenProfile={() => openSection("profile")}
          />
        )}

        {screen === "reservas" && renderReserves()}

        {screen === "config" &&
          (section === null ? (
            <SettingsPage
              categoryCount={categories.length}
              paymentMethodCount={paymentMethods.length}
              profile={profile}
              theme={theme}
              update={update}
              onOpen={openSection}
              onReset={onReset}
              sync={sync}
            />
          ) : section === "profile" ? (
            profile !== null ? (
              <ProfilePage
                profile={profile}
                store={profileStore}
                processFile={processFile}
                onColorPreview={setGlow}
                onDismissGlobalError={() => {
                  session.error.value = null;
                }}
                onBack={() => {
                  setGlow(null);
                  setSection(null);
                }}
              />
            ) : null
          ) : section === "hub" ? (
            <HubPage
              sync={sync}
              deviceNameGuess={deviceNameGuess}
              onBack={() => setSection(null)}
            />
          ) : (
            <RegistryPage
              entity={section}
              state={state}
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
        <div class="mx-auto grid h-[var(--hf-nav-h)] w-full max-w-md grid-cols-4 px-3">
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

      <Modal open={importing} title="Importar PDF" onClose={() => setImporting(false)}>
        {/* Montada só enquanto aberta: fechar descarta a revisão pela metade. */}
        {importing && (
          <ImportSheet
            state={state}
            today={today}
            readPdf={readPdf}
            onImport={(plan) => importer.commit(plan, today)}
            onClose={() => setImporting(false)}
          />
        )}
      </Modal>

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
            onAdjustSeries={
              editingSeriesId === null || !editingSeriesFixed
                ? undefined
                : () => {
                    closeModal();
                    setAdjusting(editingSeriesId);
                  }
            }
            onMakeVariable={
              editingSeriesId === null || !editingSeriesFixed
                ? undefined
                : () => {
                    closeModal();
                    void recurrence.makeVariable(editingSeriesId).catch(ignoreHandled);
                  }
            }
          />
        )}
      </Modal>

      {/*
        Este Modal tem que ficar DEPOIS do de lançamento: os efeitos rodam na
        ordem do JSX, e o `close()` do lançamento (que devolve o foco) precisa
        rodar antes do `showModal()` deste.
      */}
      <Modal open={adjusting !== null} title="Reajustar série" onClose={() => setAdjusting(null)}>
        {adjusting !== null && (
          <AdjustSheet
            key={adjusting}
            state={state}
            recurrenceId={adjusting}
            today={today}
            onConfirm={(input) => {
              setAdjusting(null);
              void recurrence.adjustSeries(input).catch(ignoreHandled);
            }}
            onRemove={(id) => {
              void recurrence.removeAdjustment(id).catch(ignoreHandled);
            }}
            onClose={() => setAdjusting(null)}
          />
        )}
      </Modal>

      <Modal open={confirming !== null} title="Confirmar valor" onClose={() => setConfirming(null)}>
        {confirming !== null && (
          <ConfirmSheet
            key={confirming.id}
            record={confirming}
            today={today}
            onConfirm={(actual) => {
              const id = confirming.id;
              setConfirming(null);
              void store.confirm(id, actual).catch(ignoreHandled);
            }}
            onClose={() => setConfirming(null)}
          />
        )}
      </Modal>

      {/*
        Depois dos modais acima pelo mesmo motivo da ordem dos efeitos. Montado
        só enquanto aberto, com `key` do movimento: trocar de movimento remonta
        o sheet e os `useState` releem as props.
      */}
      <Modal
        open={reserveSheet !== null}
        title={reserveSheetTitle(reserveSheet)}
        onClose={closeReserveSheet}
      >
        {reserveSheet?.kind === "deposit" && sheetReserve !== null && (
          <DepositSheet
            key={reserveSheet.editing?.id ?? "novo"}
            state={state}
            reserve={sheetReserve}
            today={today}
            editing={reserveSheet.editing}
            onSubmit={(input, setRecurring) => {
              const { reserveId, editing: movement } = reserveSheet;
              closeReserveSheet();
              const write =
                movement === null
                  ? reserves.deposit(reserveId, input, setRecurring)
                  : reserves.editMovement(movement.id, { ...input, reason: null });
              void write.catch(ignoreHandled);
            }}
            onDelete={() => {
              const movement = reserveSheet.editing;
              closeReserveSheet();
              if (movement !== null) void reserves.removeMovement(movement.id).catch(ignoreHandled);
            }}
            onClose={closeReserveSheet}
          />
        )}
        {reserveSheet?.kind === "withdraw" && sheetReserve !== null && (
          <WithdrawSheet
            key={reserveSheet.editing?.id ?? "novo"}
            state={state}
            reserve={sheetReserve}
            today={today}
            editing={reserveSheet.editing}
            onSubmit={(input) => {
              const { reserveId, editing: movement } = reserveSheet;
              closeReserveSheet();
              const write =
                movement === null
                  ? reserves.withdraw(reserveId, input)
                  : reserves.editMovement(movement.id, input);
              void write.catch(ignoreHandled);
            }}
            onDelete={() => {
              const movement = reserveSheet.editing;
              closeReserveSheet();
              if (movement !== null) void reserves.removeMovement(movement.id).catch(ignoreHandled);
            }}
            onClose={closeReserveSheet}
          />
        )}
      </Modal>
    </div>
  );
}
