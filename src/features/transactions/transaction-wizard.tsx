import { useState } from "preact/hooks";
import { cardDetail, isCreditCard } from "../../domain/cards/card";
import type { Ulid } from "../../domain/ids/ulid";
import { type CategoryIndex, suggestCategory } from "../../domain/import/suggest-category";
import type { Category } from "../../domain/model/category";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
import {
  FREQUENCY_LABELS,
  OFFERED_FREQUENCIES,
  type RecurrenceFrequency,
  type RecurrenceRule,
  SCHEDULE_TYPE_LABELS,
  SCHEDULE_TYPES,
  type ScheduleType,
  VARIABLE_COPY,
} from "../../domain/model/recurrence";
import {
  REPORT_STATES,
  type ReportState,
  type Transaction,
  type TransactionDraft,
  type TransactionKind,
} from "../../domain/model/transaction";
import { digitsOf, maskDigits, minorOf } from "../../domain/money/mask";
import { dayMonth } from "../../domain/projections/periods";
import {
  installmentRule,
  MIN_INSTALLMENTS,
  maxInstallmentsFor,
  splitInstallments,
} from "../../domain/recurrence/installments";
import { isDayStep } from "../../domain/recurrence/schedule";
import { nextOccurrences } from "../../domain/recurrence/upcoming";
import { offersCashback } from "../../domain/transactions/cashback";
import { NewCardButton, QuickCardSheet } from "../cards/quick-card-sheet";
import { Icon } from "../icons/icon";
import { MiniAvatar } from "../profile/avatar-view";
import { Button } from "../ui/button";
import { chipDate, DateButton, DateChips } from "../ui/date-field";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { SheetHeader } from "../ui/modal";
import { brl, signedBRL } from "../ui/money";
import { Progress } from "../ui/progress";
import { Segmented } from "../ui/segmented";
import { SummaryChip } from "../ui/summary-chip";
import { IconTile } from "../ui/tile";
import { Toggle } from "../ui/toggle";
import { CategoryTile, MethodRow } from "./choice-tiles";

export interface TransactionWizardProps {
  /** Registro em edição, ou null para criação. Montado com `key` pelo App. */
  editing: Transaction | null;
  /** `recurrence` é a regra de série pedida na criação; null = lançamento avulso. */
  onSubmit: (draft: TransactionDraft, recurrence: RecurrenceRule | null) => void;
  onCancel: () => void;
  today: string;
  /** Tipo pré-selecionado na criação. Ignorado na edição, onde o registro manda. */
  initialKind?: TransactionKind;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  /** Só na edição: segurar a lixeira do cabeçalho exclui o lançamento. */
  onDelete?: () => void;
  /** Autor do registro em edição ("Criado por Luiz"). */
  author?: { name: string; color: string } | null;
  /** "Gerenciar" e "+ Nova" da grade de categorias levam aos cadastros. */
  onManageCategories?: () => void;
  /** Só em ocorrência de série fixa: abre o reajuste da série. */
  onAdjustSeries?: () => void;
  /** Só em ocorrência de série fixa: passa a série a ter valor variável. */
  onMakeVariable?: () => void;
  /**
   * Índice descrição → categoria do histórico (o mesmo da importação de PDF).
   * Sem ele não há sugestão: o formulário funciona igual.
   */
  categoryIndex?: CategoryIndex;
  /**
   * Grava um cartão de crédito novo (a escrita do cadastro). Presente, o passo de
   * pagamento oferece "Novo cartão de crédito" e seleciona o cartão salvo.
   */
  onCreateCard?: (draft: PaymentMethodDraft) => Promise<PaymentMethod>;
}

/**
 * Criação tem etapa própria de recorrência; edição não — alterar a série não é
 * o mesmo que editar uma ocorrência, e misturar os dois no mesmo fluxo esconderia
 * qual decisão o usuário está tomando.
 */
//
// "Repetir" é a última: parcelar depende do valor já digitado e é a decisão que
// muda quantos lançamentos o botão final vai criar.
const CREATE_STEPS = ["Dados", "Categoria", "Pagamento", "Repetir"] as const;
const EDIT_STEPS = ["Dados", "Categoria", "Pagamento"] as const;

const KINDS = [
  { value: "expense", label: "Despesa", tone: "expense" },
  { value: "income", label: "Receita", tone: "income" },
] as const;

/**
 * Um segmento e não dois toggles: "parcelado" e "repete" juntos permitiriam
 * parcelamento com valor variável ou data final própria, combinações sem sentido.
 */
type RepeatMode = "once" | "installments" | "repeats";

const REPEAT_OPTIONS: readonly { value: RepeatMode; label: string }[] = [
  { value: "once", label: "Não repete" },
  { value: "installments", label: "Parcelado" },
  { value: "repeats", label: "Repete" },
];

const REPEAT_HINTS: Record<RepeatMode, string> = {
  once: "Acontece uma vez só.",
  installments: "O valor informado é o total da compra, dividido em parcelas mensais.",
  repeats: "Gera as próximas vezes sozinho.",
};

/** Como o lançamento entra nas contas; `counts` é a ausência de `reportState`. */
type CountMode = "counts" | ReportState;

const COUNT_OPTIONS: readonly { value: CountMode; label: string }[] = [
  { value: "counts", label: "Conta" },
  { value: "transfer", label: "Transferência" },
  { value: "hidden", label: "Oculto" },
];

const COUNT_HINTS: Record<CountMode, string> = {
  counts: "Entra no saldo, na receita ou na despesa e nos gráficos.",
  transfer: "Movimento entre contas suas, como pagar a fatura. Não é receita nem despesa.",
  hidden: "Continua na lista, mas fica fora de saldo, gráficos e relatórios.",
};

/** Rótulo curto da tag do cashback: de onde ele foi liberado. */
const CASHBACK_SOURCE: Record<string, string> = {
  credit: "liberado pelo crédito",
  debit: "liberado pelo débito",
};

/**
 * Formulário de lançamento em etapas.
 *
 * A wizard guarda o rascunho inteiro e emite **um único submit**, no fim. Isso não
 * é preferência de estilo: a regra do cashback depende de dois eixos que vivem em
 * etapas diferentes — o tipo do lançamento e a forma de pagamento. Com submit por
 * etapa, voltar e trocar para receita deixaria de limpar o cashback, que é
 * exatamente o dado sujo permanente que a regra existe para prevenir.
 */
export function TransactionWizard({
  editing,
  onSubmit,
  onCancel,
  today,
  initialKind,
  categories,
  paymentMethods,
  onDelete,
  author,
  onManageCategories,
  onAdjustSeries,
  onMakeVariable,
  categoryIndex,
  onCreateCard,
}: TransactionWizardProps) {
  const [step, setStep] = useState(0);
  // Sheet do cartão no lugar do formulário (não por cima): o rascunho do lançamento
  // vive nos estados deste componente e sobrevive a abrir e fechar o cadastro.
  const [creatingCard, setCreatingCard] = useState(false);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [description, setDescription] = useState(editing?.description ?? "");
  // Dígitos, não texto formatado: a máscara é quem decide como o número aparece.
  const [amount, setAmount] = useState(editing === null ? "" : String(editing.amountMinor));
  // Na edição o registro manda; na criação, o botão que abriu o sheet.
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? initialKind ?? "expense");
  const [occurredOn, setOccurredOn] = useState(editing?.occurredOn ?? today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<Ulid | null>(editing?.categoryId ?? null);
  const [paymentMethodId, setPaymentMethodId] = useState<Ulid | null>(
    editing?.paymentMethodId ?? null,
  );
  const [cashback, setCashback] = useState(
    editing?.cashbackMinor == null ? "" : String(editing.cashbackMinor),
  );
  // Série só na criação: editar ocorrência materializada não reescreve a regra.
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("once");
  // Texto cru, como o `scheduleN` do dia: guardar o número já limitado faria o
  // "1" de "10" virar "2" no meio da digitação.
  const [installmentsText, setInstallmentsText] = useState(String(MIN_INSTALLMENTS));
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("dayOfMonth");
  const [scheduleN, setScheduleN] = useState(() => Number(occurredOn.slice(8, 10)) || 1);
  const [variable, setVariable] = useState(false);
  const [hasEnd, setHasEnd] = useState(false);
  const [endOn, setEndOn] = useState(today);
  // Valor que esta versão não conhece (vindo do sync) aparece como "Conta", que é
  // como ele é tratado; e só é regravado se o usuário escolher outra opção.
  const initialCount: CountMode = (REPORT_STATES as readonly string[]).includes(
    editing?.reportState ?? "",
  )
    ? (editing?.reportState as ReportState)
    : "counts";
  const [countMode, setCountMode] = useState<CountMode>(initialCount);
  const [problem, setProblem] = useState<string | null>(null);
  // Sugestão dispensada, por categoria: mudar a descrição para outra loja pode
  // sugerir outra categoria, e essa o usuário ainda não viu.
  const [dismissedSuggestion, setDismissedSuggestion] = useState<Ulid | null>(null);

  const selectedMethod = paymentMethods.find((method) => method.id === paymentMethodId) ?? null;
  const showsCashback = offersCashback(selectedMethod?.kind ?? null, kind);
  const canConfigureRecurrence = editing === null;
  const steps = canConfigureRecurrence ? CREATE_STEPS : EDIT_STEPS;
  // "Repetir" só existe na criação e vem por último, então não desloca os outros.
  const categoryStep = 1;
  const paymentStep = 2;
  const recurrenceStep = 3;

  /*
    Filtra pelo tipo do lançamento, e o filtro é reativo: trocar de despesa para
    receita na etapa 1 troca a grade da categoria. "Salário" oferecido numa
    despesa é a razão de `kind` existir na categoria.

    A escolha já feita **não** é limpa ao trocar o tipo — isso apagaria em
    silêncio uma decisão do usuário por causa de um toque no segmento. Ela é
    reanexada à grade: sem isso a grade a trataria como referência morta e a
    rotularia "Categoria removida", que seria mentira.
  */
  const offered = categories.filter(
    (category) => category.kind === kind || category.kind === "both",
  );
  const chosenCategory = categories.find((category) => category.id === categoryId) ?? null;
  const categoryItems =
    chosenCategory !== null && !offered.some((category) => category.id === chosenCategory.id)
      ? [...offered, chosenCategory]
      : offered;
  /*
    Só aparece enquanto não há categoria escolhida e nunca é gravada sozinha:
    quem decide é o toque em "Usar". Escolha já feita (inclusive a de uma edição)
    não é substituída. Precisa servir ao tipo atual: a grade oferecida é quem
    sabe se a categoria serve a ele.
  */
  const suggestedId =
    categoryIndex === undefined || categoryId !== null
      ? null
      : suggestCategory(categoryIndex, description, kind);
  const suggestedCategory =
    suggestedId === null || suggestedId === dismissedSuggestion
      ? null
      : (offered.find((category) => category.id === suggestedId) ?? null);
  const suggestionChip =
    suggestedCategory === null ? null : (
      <div
        class="mt-4 flex items-center gap-2.5 rounded-lg bg-bg px-3 py-2"
        data-testid="category-suggestion"
      >
        <IconTile
          icon={suggestedCategory.icon}
          color={suggestedCategory.color}
          size={26}
          iconSize={15}
        />
        <p class="min-w-0 flex-1 truncate text-[13px] text-fg/70">
          Sugestão: <span class="font-medium text-fg">{suggestedCategory.name}</span>
        </p>
        <button
          type="button"
          onClick={() => setCategoryId(suggestedCategory.id)}
          class="hf-press rounded-md px-2 py-1 text-[13px] font-medium text-accent-300"
        >
          Usar
        </button>
        <button
          type="button"
          aria-label="Dispensar sugestão"
          onClick={() => setDismissedSuggestion(suggestedCategory.id)}
          class="hf-press grid size-7 place-items-center rounded-md text-fg/55"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    );
  const categoryIsDead = categoryId !== null && chosenCategory === null;
  const methodIsDead = paymentMethodId !== null && selectedMethod === null;

  const trimmed = description.trim();
  // Valor inválido deixou de ser estado possível: a máscara só admite dígitos.
  const amountMinor = minorOf(amount);
  const detailsValid = trimmed !== "" && amountMinor > 0;
  // Depois de "Dados", o resto não bloqueia: repetir, categoria e pagamento são opcionais.
  const maxReachable = detailsValid ? steps.length - 1 : 0;
  const clampedN = Math.min(31, Math.max(1, Math.trunc(scheduleN) || 1));
  // Mudar o valor depois de escolher as vezes não pode deixar parcela de zero
  // centavo: o número efetivo é limitado pelo total, sem apagar a escolha.
  const maxInstallments = maxInstallmentsFor(amountMinor);
  const installmentCount = Math.min(
    maxInstallments,
    Math.max(MIN_INSTALLMENTS, Math.trunc(Number(installmentsText)) || MIN_INSTALLMENTS),
  );
  const parcelled = canConfigureRecurrence && repeatMode === "installments";
  const canSplit = amountMinor >= MIN_INSTALLMENTS;
  const split = canSplit ? splitInstallments(amountMinor, installmentCount) : null;

  function validateDetails(): boolean {
    if (trimmed === "") {
      setProblem("Informe uma descrição.");
      return false;
    }
    if (amountMinor === 0) {
      setProblem("Informe um valor maior que zero.");
      return false;
    }
    setProblem(null);
    return true;
  }

  function goTo(index: number) {
    // Sair da etapa 1 valida na hora, com o erro junto do campo. Validar só no
    // fim mostraria o problema a duas telas de distância de onde ele nasceu.
    if (step === 0 && index > 0 && !validateDetails()) return;
    setProblem(null);
    setDir(index < step ? "back" : "next");
    setStep(index);
  }

  function recurrenceInput(): RecurrenceRule {
    // Semanal/quinzenal ignoram "Quando"/"Dia": grava o padrão, não o que sobrou
    // de uma escolha feita antes de trocar a frequência.
    const byDays = isDayStep(frequency);
    return {
      frequency,
      scheduleType: byDays ? "dayOfMonth" : scheduleType,
      scheduleN: byDays ? Number(occurredOn.slice(8, 10)) || 1 : clampedN,
      endOn: hasEnd ? endOn : null,
      variable,
    };
  }

  function recurrenceForSubmit(): RecurrenceRule | null {
    if (!canConfigureRecurrence || repeatMode === "once") return null;
    if (repeatMode === "repeats") return recurrenceInput();
    // A store recalcula a regra a partir de `installments`; mandar a regra
    // completa mantém o contrato de `onSubmit` para quem só lê a regra.
    return { ...installmentRule(occurredOn, installmentCount), installments: installmentCount };
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!validateDetails()) {
      setStep(0);
      return;
    }
    if (parcelled && !canSplit) {
      setProblem("Valor pequeno demais para parcelar.");
      return;
    }

    onSubmit(
      {
        kind,
        description: trimmed,
        amountMinor,
        currency: "BRL",
        categoryId,
        paymentMethodId,
        // A limpeza acontece aqui, no draft, e não escondendo o campo. Um cashback
        // pendurado numa despesa em dinheiro seria dado sujo permanente: invisível
        // na tela, presente no export, replicado pelo sync.
        // Campo vazio continua sendo `null`, não zero: "não houve cashback" e
        // "voltou R$ 0,00" são coisas diferentes, e o banco guarda as duas.
        cashbackMinor: showsCashback && cashback !== "" ? minorOf(cashback) : null,
        occurredOn,
        // Avulso: a série e a competência só entram pela materialização.
        recurrenceId: editing?.recurrenceId ?? null,
        occurrenceKey: editing?.occurrenceKey ?? null,
        // Salvar uma estimativa pelo assistente é confirmá-la, mesmo sem mudar
        // o valor: abrir e salvar é um ato deliberado, e deixá-la estimada
        // depois de mexer na data seria um limbo sem explicação.
        ...(editing?.estimated === true ? { estimated: false } : {}),
        // Só quando mudou: criar sem escolher não grava a coluna, e abrir e salvar
        // uma linha com valor futuro não o apaga.
        ...(countMode !== initialCount
          ? { reportState: countMode === "counts" ? null : countMode }
          : {}),
      },
      recurrenceForSubmit(),
    );
  }

  const isLast = step === steps.length - 1;
  const signed = signedBRL(kind === "expense" ? -amountMinor : amountMinor, "always");
  const dateWord = occurredOn === today ? "Hoje" : chipDate(occurredOn, today);
  const toneDot = (
    <span
      aria-hidden="true"
      class={`size-2 shrink-0 rounded-full ${kind === "expense" ? "bg-expense" : "bg-income"}`}
    />
  );
  const amountTone = kind === "income" ? "text-income-fg" : "";

  if (creatingCard && onCreateCard !== undefined) {
    return (
      <QuickCardSheet
        existingNames={paymentMethods.map((method) => method.name)}
        onCreate={onCreateCard}
        onCreated={(card) => {
          setPaymentMethodId(card.id);
          setCreatingCard(false);
        }}
        onCancel={() => setCreatingCard(false)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} class="flex flex-col">
      <SheetHeader
        title={editing === null ? "Novo lançamento" : "Editar lançamento"}
        onClose={onCancel}
        actions={
          editing !== null && onDelete !== undefined ? (
            <HoldToDelete label={`Excluir ${editing.description}`} onConfirm={onDelete} />
          ) : undefined
        }
      />

      <div class="mt-5">
        <Progress
          steps={steps}
          current={step}
          maxReachable={maxReachable}
          onGo={goTo}
          aside={
            editing !== null && author != null ? (
              <>
                <MiniAvatar name={author.name} color={author.color} />
                Criado por {author.name}
              </>
            ) : undefined
          }
        />
      </div>

      {/*
        A `key` é o que faz a etapa remontar, e a remontagem é o que dispara a
        animação de entrada. Sem ela o Preact reaproveitaria o nó e a troca
        continuaria instantânea.
      */}
      <div key={step} data-dir={dir} class="hf-step mt-5">
        {step === 0 && (
          <>
            <Segmented
              name="kind"
              legend="Tipo"
              variant="pill"
              options={KINDS}
              value={kind}
              onChange={setKind}
            />

            {/*
              Com o calendário aberto, valor e descrição encolhem para uma linha
              de duas colunas: o sheet não pode passar da tela e empurrar o
              "Continuar" para fora do alcance.
            */}
            <div class={calendarOpen ? "mt-5 grid grid-cols-2 gap-3" : "mt-6"}>
              <div>
                <label class={LABEL} for="amount">
                  Valor
                </label>
                <div
                  class="mt-1.5 flex items-baseline gap-1.5 border-b border-divider pb-1.5
                    transition-colors duration-150 focus-within:border-accent"
                >
                  <span
                    aria-hidden="true"
                    class={calendarOpen ? "text-sm text-fg/55" : "text-xl text-fg/55"}
                  >
                    R$
                  </span>
                  {/*
                    `inputMode="numeric"` e não `"decimal"`: a vírgula deixou de
                    existir para quem digita — a máscara põe os centavos sozinha.
                  */}
                  <input
                    id="amount"
                    name="amount"
                    type="text"
                    inputMode="numeric"
                    autocomplete="off"
                    placeholder="0,00"
                    value={maskDigits(amount)}
                    onInput={(event) => setAmount(digitsOf(event.currentTarget))}
                    class={`hf-num w-full min-w-0 bg-transparent font-medium tracking-[-0.02em]
                      outline-none placeholder:text-fg/30 focus-visible:outline-none ${amountTone} ${
                        calendarOpen ? "text-2xl" : "text-[40px] leading-tight"
                      }`}
                  />
                </div>
              </div>

              <div class={calendarOpen ? "" : "mt-5"}>
                <label class={LABEL} for="description">
                  Descrição
                </label>
                <input
                  id="description"
                  name="description"
                  type="text"
                  autocomplete="off"
                  placeholder="Mercado, aluguel, salário..."
                  class={
                    calendarOpen
                      ? "mt-1.5 w-full min-w-0 border-b border-divider bg-transparent pb-1.5 text-2xl outline-none focus:border-accent focus-visible:outline-none"
                      : `${FIELD_SHEET} mt-2`
                  }
                  value={description}
                  onInput={(event) => setDescription(event.currentTarget.value)}
                />
              </div>
            </div>

            {!calendarOpen && suggestionChip}

            <div class="mt-5">
              <DateChips
                value={occurredOn}
                today={today}
                onCalendarToggle={setCalendarOpen}
                onChange={(next) => {
                  setOccurredOn(next);
                  // Na etapa Repetir, o dia default acompanha a data escolhida aqui.
                  if (repeatMode !== "repeats") setScheduleN(Number(next.slice(8, 10)) || 1);
                }}
              />
            </div>

            {editing?.recurrenceId != null && (
              <p class={`${HINT} flex items-center gap-1.5`}>
                <Icon name="repeat" size={14} />
                Faz parte de uma série. Alterar aqui muda só esta ocorrência.
              </p>
            )}
            {/*
              `type="button"`: dentro do <form>, um botão sem tipo é submit e
              gravaria a edição em curso no caminho para o reajuste.
            */}
            {editing?.estimated === true && (
              <p class={`${HINT} flex items-center gap-1.5`}>
                <Icon name="info" size={14} />
                Valor estimado. Salvar confirma este lançamento.
              </p>
            )}
            {editing?.recurrenceId != null &&
              (onAdjustSeries !== undefined || onMakeVariable !== undefined) && (
                <div class="mt-2 flex flex-wrap gap-1">
                  {onAdjustSeries !== undefined && (
                    <button
                      type="button"
                      onClick={onAdjustSeries}
                      class="hf-press inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5
                        text-[13px] font-medium text-accent-300 hover:bg-fg/[0.06]"
                    >
                      <Icon name="trend-up" size={14} />
                      Reajustar série
                    </button>
                  )}
                  {onMakeVariable !== undefined && (
                    <button
                      type="button"
                      onClick={onMakeVariable}
                      class="hf-press inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5
                        text-[13px] font-medium text-accent-300 hover:bg-fg/[0.06]"
                    >
                      <Icon name="wave-sine" size={14} />
                      Tornar valor variável
                    </button>
                  )}
                </div>
              )}
          </>
        )}

        {canConfigureRecurrence && step === recurrenceStep && (
          <fieldset>
            <legend class="sr-only">Recorrência</legend>
            <SummaryChip
              leading={toneDot}
              title={trimmed}
              context={dateWord}
              trailing={<span class={amountTone}>{signed}</span>}
            />

            <div class="mt-4">
              <Segmented
                name="repeat-mode"
                legend="Repetir"
                options={REPEAT_OPTIONS}
                value={repeatMode}
                onChange={(mode) => {
                  if (mode === "repeats" && repeatMode !== "repeats") {
                    setScheduleN(Number(occurredOn.slice(8, 10)) || 1);
                  }
                  setRepeatMode(mode);
                }}
              />
              <p class={HINT}>{REPEAT_HINTS[repeatMode]}</p>
            </div>

            {repeatMode === "installments" && (
              <InstallmentFields
                count={installmentCount}
                text={installmentsText}
                max={maxInstallments}
                split={split}
                firstOn={occurredOn}
                onText={setInstallmentsText}
              />
            )}

            {repeatMode === "repeats" && (
              <div key="recurrence-fields" class="hf-disclose mt-5 space-y-5">
                <div>
                  <p class={LABEL}>Frequência</p>
                  <Segmented
                    name="frequency"
                    legend="Frequência"
                    dense
                    class="mt-2"
                    options={OFFERED_FREQUENCIES.map((value) => ({
                      value,
                      label: FREQUENCY_LABELS[value],
                    }))}
                    value={frequency}
                    onChange={setFrequency}
                  />
                </div>

                {isDayStep(frequency) ? (
                  <p class={HINT}>
                    {frequency === "weekly"
                      ? "Repete a cada 7 dias, a partir da data do lançamento."
                      : "Repete a cada 14 dias, a partir da data do lançamento."}
                  </p>
                ) : (
                  <div>
                    <div class="grid grid-cols-[1.4fr_1fr] gap-3">
                      <div>
                        <label class={LABEL} for="recurrence-schedule-type">
                          Quando
                        </label>
                        <div class="relative mt-2">
                          <select
                            id="recurrence-schedule-type"
                            class={`${FIELD_SHEET} appearance-none pr-9 text-[15px]`}
                            value={scheduleType}
                            onChange={(event) =>
                              setScheduleType(event.currentTarget.value as ScheduleType)
                            }
                          >
                            {SCHEDULE_TYPES.map((value) => (
                              <option key={value} value={value}>
                                {SCHEDULE_TYPE_LABELS[value]}
                              </option>
                            ))}
                          </select>
                          <Icon
                            name="caret-down"
                            size={16}
                            class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg/55"
                          />
                        </div>
                      </div>

                      <div>
                        <label class={LABEL} for="recurrence-schedule-n">
                          {scheduleType === "nthBusinessDay" ? "Nº do dia útil" : "Dia"}
                        </label>
                        {/*
                      Stepper em vez do teclado: o valor quase sempre anda um ou
                      dois dias a partir da data do lançamento.
                    */}
                        <div class="mt-2 flex h-12 items-center rounded-lg border border-divider bg-bg">
                          <button
                            type="button"
                            aria-label="Diminuir dia"
                            onClick={() => setScheduleN(Math.max(1, clampedN - 1))}
                            class="hf-press grid h-full w-10 place-items-center text-fg/70"
                          >
                            <Icon name="minus" size={16} />
                          </button>
                          <input
                            id="recurrence-schedule-n"
                            type="number"
                            min={1}
                            max={31}
                            inputMode="numeric"
                            class="hf-num w-full min-w-0 appearance-none bg-transparent text-center text-base
                          outline-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={scheduleN}
                            onInput={(event) =>
                              setScheduleN(Number(event.currentTarget.value) || 1)
                            }
                          />
                          <button
                            type="button"
                            aria-label="Aumentar dia"
                            onClick={() => setScheduleN(Math.min(31, clampedN + 1))}
                            class="hf-press grid h-full w-10 place-items-center text-fg/70"
                          >
                            <Icon name="plus" size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <p class={HINT}>
                      {scheduleType === "nthBusinessDay"
                        ? "Dia útil = segunda a sexta (sem feriados nesta versão)."
                        : "Se o mês for mais curto, usa o último dia."}
                    </p>
                  </div>
                )}

                <div class="rounded-lg bg-bg px-4 py-3">
                  <Toggle
                    label={VARIABLE_COPY[frequency].label}
                    hint={
                      variable ? VARIABLE_COPY[frequency].hintOn : VARIABLE_COPY[frequency].hintOff
                    }
                    checked={variable}
                    onChange={setVariable}
                  />
                </div>

                <div class="rounded-lg bg-bg px-4 py-3">
                  <Toggle label="Tem data final" checked={hasEnd} onChange={setHasEnd} />
                  {hasEnd && (
                    <div key="recurrence-end" class="hf-disclose mt-3 pb-1">
                      <DateButton
                        id="recurrence-end"
                        label="Termina em"
                        value={endOn}
                        today={today}
                        onChange={setEndOn}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <span class={LABEL}>Próximas vezes</span>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    {nextOccurrences(
                      {
                        startOn: occurredOn,
                        frequency,
                        scheduleType,
                        scheduleN: clampedN,
                        endOn: hasEnd ? endOn : null,
                      },
                      4,
                    ).map((date) => (
                      <span
                        key={date}
                        class="hf-num rounded-md bg-bg px-2.5 py-1.5 text-[13px] text-fg/75"
                      >
                        {dayMonth(date)}
                      </span>
                    ))}
                    <span class="px-1 py-1.5 text-[13px] text-fg/45">…</span>
                  </div>
                </div>
              </div>
            )}
          </fieldset>
        )}

        {step === categoryStep && (
          <fieldset>
            <SummaryChip
              leading={toneDot}
              title={trimmed}
              context={dateWord}
              trailing={<span class={amountTone}>{signed}</span>}
            />

            <div class="mt-5 flex items-center justify-between">
              <legend class={LABEL}>Categoria</legend>
              {onManageCategories !== undefined && (
                <button
                  type="button"
                  onClick={onManageCategories}
                  class="hf-press text-[13px] font-medium text-accent-300"
                >
                  Gerenciar
                </button>
              )}
            </div>

            {suggestionChip}

            {categories.length === 0 && !categoryIsDead ? (
              <p class="mt-2 rounded-lg bg-bg px-3.5 py-3 text-sm text-fg/60">
                Nenhuma categoria ainda. Cadastre em Categorias.
              </p>
            ) : (
              <div class="mt-2 grid grid-cols-3 gap-2">
                <CategoryTile
                  name="Sem categoria"
                  icon="prohibit"
                  color={null}
                  checked={categoryId === null}
                  onSelect={() => setCategoryId(null)}
                />
                {categoryIsDead && (
                  <CategoryTile
                    name="Categoria removida"
                    icon="tag"
                    color={null}
                    checked
                    onSelect={() => setCategoryId(categoryId)}
                  />
                )}
                {categoryItems.map((category) => (
                  <CategoryTile
                    key={category.id}
                    name={category.name}
                    icon={category.icon}
                    color={category.color}
                    checked={categoryId === category.id}
                    onSelect={() => setCategoryId(category.id)}
                  />
                ))}
                {onManageCategories !== undefined && (
                  <button
                    type="button"
                    onClick={onManageCategories}
                    class="hf-press flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg
                      border border-dashed border-neutral-700 text-[12.5px] font-medium text-fg/60"
                  >
                    <Icon name="plus" size={18} />
                    Nova
                  </button>
                )}
              </div>
            )}
          </fieldset>
        )}

        {step === paymentStep && (
          <>
            <SummaryChip
              leading={
                chosenCategory === null ? (
                  toneDot
                ) : (
                  <IconTile
                    icon={chosenCategory.icon}
                    color={chosenCategory.color}
                    size={22}
                    iconSize={13}
                  />
                )
              }
              title={trimmed}
              context={chosenCategory?.name ?? dateWord}
              trailing={<span class={amountTone}>{signed}</span>}
            />

            <fieldset class="mt-5">
              <legend class={LABEL}>Forma de pagamento</legend>
              {paymentMethods.length === 0 && !methodIsDead ? (
                <p class="mt-2 rounded-lg bg-bg px-3.5 py-3 text-sm text-fg/60">
                  Nenhuma forma de pagamento ainda. Cadastre em Pagamentos.
                </p>
              ) : (
                <div class="mt-2 overflow-hidden rounded-lg bg-bg">
                  <MethodRow
                    first
                    name="Sem forma de pagamento"
                    icon="prohibit"
                    color={null}
                    checked={paymentMethodId === null}
                    onSelect={() => setPaymentMethodId(null)}
                  />
                  {methodIsDead && (
                    <MethodRow
                      name="Forma removida"
                      icon="wallet"
                      color={null}
                      checked
                      onSelect={() => setPaymentMethodId(paymentMethodId)}
                    />
                  )}
                  {paymentMethods.map((method) => (
                    <MethodRow
                      key={method.id}
                      name={method.name}
                      icon={method.icon}
                      color={method.color}
                      credit={isCreditCard(method)}
                      detail={cardDetail(method)}
                      checked={paymentMethodId === method.id}
                      onSelect={() => setPaymentMethodId(method.id)}
                    />
                  ))}
                </div>
              )}
              {onCreateCard !== undefined && (
                <NewCardButton class="mt-3" onClick={() => setCreatingCard(true)} />
              )}
            </fieldset>

            <fieldset class="mt-5">
              <legend class={LABEL}>Nas contas</legend>
              <Segmented
                name="count-mode"
                legend="Nas contas"
                dense
                class="mt-2"
                options={COUNT_OPTIONS}
                value={countMode}
                onChange={setCountMode}
              />
              <p class={HINT}>{COUNT_HINTS[countMode]}</p>
            </fieldset>

            {showsCashback && (
              <div class="hf-disclose mt-5">
                <div class="flex items-center gap-2">
                  <label class={LABEL} for="cashback">
                    Cashback
                  </label>
                  <span class="rounded bg-accent-900 px-1.5 py-0.5 text-[10px] font-medium text-accent-300">
                    {CASHBACK_SOURCE[selectedMethod?.kind ?? ""] ?? ""}
                  </span>
                </div>
                <div class="relative mt-2">
                  <span
                    aria-hidden="true"
                    class="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-fg/55"
                  >
                    R$
                  </span>
                  <input
                    id="cashback"
                    name="cashback"
                    type="text"
                    inputMode="numeric"
                    autocomplete="off"
                    placeholder="0,00"
                    class={`${FIELD_SHEET} hf-num pl-10`}
                    value={maskDigits(cashback)}
                    onInput={(event) => setCashback(digitsOf(event.currentTarget))}
                  />
                </div>
                <p class={HINT}>Quanto voltou. Não entra no saldo — fica registrado na despesa.</p>
              </div>
            )}
          </>
        )}
      </div>

      {problem !== null && (
        <p role="alert" class="mt-4 text-sm text-expense-fg">
          {problem}
        </p>
      )}

      {/*
        Ações presas no rodapé do sheet: o polegar as acha no mesmo lugar em
        todos os passos, por mais que o conteúdo acima cresça.

        As `key` distintas não são decoração. Sem elas o Preact reaproveita o nó
        e só troca o `type`; como o navegador executa a activation behavior
        depois do handler, o clique em "Continuar" gravava o lançamento em vez
        de avançar.
      */}
      <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
        {step > 0 && (
          <Button key="voltar" variant="secondary" onClick={() => goTo(step - 1)}>
            Voltar
          </Button>
        )}
        {editing !== null && step === 0 && (
          // Edição costuma ser um campo só: salvar direto, sem percorrer os passos.
          <Button key="salvar-direto" type="submit" variant="secondary">
            Salvar
          </Button>
        )}
        {isLast ? (
          <Button key="enviar" type="submit" icon="check" iconSide="left" class="flex-1">
            {editing !== null
              ? "Salvar"
              : parcelled && split !== null
                ? `Lançar ${installmentCount}x de ${brl(split.amountMinor)}`
                : kind === "income"
                  ? "Adicionar receita"
                  : "Adicionar despesa"}
          </Button>
        ) : (
          <Button key="avancar" icon="arrow-right" class="flex-1" onClick={() => goTo(step + 1)}>
            Continuar
          </Button>
        )}
      </div>
    </form>
  );
}

interface InstallmentFieldsProps {
  count: number;
  max: number;
  /** `null`: o total não chega a um centavo por parcela. */
  split: { amountMinor: number; firstAmountMinor: number } | null;
  /** Data da compra, que é a da 1ª parcela. */
  firstOn: string;
  /** O que está no campo, ainda sem limite (pode estar vazio no meio da digitação). */
  text: string;
  onText: (text: string) => void;
}

/** Quantas vezes, quanto fica cada parcela e quando elas caem. */
function InstallmentFields({ count, text, max, split, firstOn, onText }: InstallmentFieldsProps) {
  if (split === null) {
    return <p class={`${HINT} mt-5`}>Valor pequeno demais para parcelar.</p>;
  }
  const rule = installmentRule(firstOn, count);
  // A mesma aritmética da materialização: o que a prévia promete é o que será gravado.
  const dates = [
    firstOn,
    ...nextOccurrences({ ...rule, startOn: firstOn }, Math.min(3, count - 1)),
  ];
  const last = rule.endOn ?? firstOn;
  return (
    <div key="installment-fields" class="hf-disclose mt-5 space-y-5">
      <div>
        <label class={LABEL} for="installment-count">
          Em quantas vezes
        </label>
        {/* Stepper como o do dia: o número quase sempre anda pouco a partir de 2. */}
        <div class="mt-2 flex h-12 items-center rounded-lg border border-divider bg-bg">
          <button
            type="button"
            aria-label="Menos parcelas"
            disabled={count <= MIN_INSTALLMENTS}
            onClick={() => onText(String(Math.max(MIN_INSTALLMENTS, count - 1)))}
            class="hf-press grid h-full w-12 place-items-center text-fg/70 disabled:opacity-40"
          >
            <Icon name="minus" size={16} />
          </button>
          <input
            id="installment-count"
            type="number"
            min={MIN_INSTALLMENTS}
            max={max}
            inputMode="numeric"
            class="hf-num w-full min-w-0 appearance-none bg-transparent text-center text-base
              outline-none [&::-webkit-inner-spin-button]:appearance-none"
            value={text}
            onInput={(event) => onText(event.currentTarget.value.replace(/\D/g, "").slice(0, 3))}
            // Ao sair do campo ele mostra o número que vale (vazio vira 2, 99 vira 48).
            onBlur={() => onText(String(count))}
          />
          <button
            type="button"
            aria-label="Mais parcelas"
            disabled={count >= max}
            onClick={() => onText(String(Math.min(max, count + 1)))}
            class="hf-press grid h-full w-12 place-items-center text-fg/70 disabled:opacity-40"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>

      <div class="rounded-lg bg-bg px-4 py-3" data-testid="installment-preview">
        <p class="hf-num text-[15px] font-medium">
          {count}x de {brl(split.amountMinor)}
        </p>
        {split.firstAmountMinor !== split.amountMinor && (
          <p class={HINT}>
            1ª parcela de {brl(split.firstAmountMinor)}, com os centavos que sobram.
          </p>
        )}
      </div>

      <div>
        <span class={LABEL}>Parcelas</span>
        <div class="mt-2 flex flex-wrap gap-1.5">
          {dates.map((date) => (
            <span key={date} class="hf-num rounded-md bg-bg px-2.5 py-1.5 text-[13px] text-fg/75">
              {dayMonth(date)}
            </span>
          ))}
          {count > dates.length && (
            <span class="px-1 py-1.5 text-[13px] text-fg/45">
              … última em {dayMonth(last)} de {last.slice(0, 4)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
