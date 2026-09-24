import { useState } from "preact/hooks";
import {
  FREQUENCY_LABELS,
  RECURRENCE_FREQUENCIES,
  type RecurrenceFrequency,
  SCHEDULE_TYPE_LABELS,
  SCHEDULE_TYPES,
  type ScheduleType,
} from "../../domain/events/recurrence";
import type { TransactionDraft, TransactionKind } from "../../domain/events/transaction";
import type { Ulid } from "../../domain/ids/ulid";
import { maskDigits, minorOf, onlyDigits } from "../../domain/money/mask";
import type {
  CategoryRecord,
  PaymentMethodRecord,
  TransactionRecord,
} from "../../domain/projections/apply";
import { dayMonth } from "../../domain/projections/periods";
import { nextOccurrences } from "../../domain/recurrence/upcoming";
import { offersCashback } from "../../domain/transactions/cashback";
import { Icon } from "../icons/icon";
import { MiniAvatar } from "../profile/avatar-view";
import { Button } from "../ui/button";
import { chipDate, DateButton, DateChips } from "../ui/date-field";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { SheetHeader } from "../ui/modal";
import { signedBRL } from "../ui/money";
import { Progress } from "../ui/progress";
import { Segmented } from "../ui/segmented";
import { SummaryChip } from "../ui/summary-chip";
import { IconTile } from "../ui/tile";
import { Toggle } from "../ui/toggle";

/** Regra de série pedida na criação. Null = lançamento avulso. */
export interface RecurrenceInput {
  frequency: RecurrenceFrequency;
  scheduleType: ScheduleType;
  scheduleN: number;
  endOn: string | null;
}

export interface TransactionWizardProps {
  /** Registro em edição, ou null para criação. Montado com `key` pelo App. */
  editing: TransactionRecord | null;
  onSubmit: (draft: TransactionDraft, recurrence: RecurrenceInput | null) => void;
  onCancel: () => void;
  today: string;
  /** Tipo pré-selecionado na criação. Ignorado na edição, onde o registro manda. */
  initialKind?: TransactionKind;
  categories: CategoryRecord[];
  paymentMethods: PaymentMethodRecord[];
  /** Só na edição: segurar a lixeira do cabeçalho exclui o lançamento. */
  onDelete?: () => void;
  /** Autor do registro em edição ("Criado por Luiz"). */
  author?: { name: string; color: string } | null;
  /** "Gerenciar" e "+ Nova" da grade de categorias levam aos cadastros. */
  onManageCategories?: () => void;
}

/**
 * Criação tem etapa própria de recorrência; edição não — alterar a série não é
 * o mesmo que editar uma ocorrência, e misturar os dois no mesmo fluxo esconderia
 * qual decisão o usuário está tomando.
 */
const CREATE_STEPS = ["Dados", "Repetir", "Categoria", "Pagamento"] as const;
const EDIT_STEPS = ["Dados", "Categoria", "Pagamento"] as const;

const KINDS = [
  { value: "expense", label: "Despesa", tone: "expense" },
  { value: "income", label: "Receita", tone: "income" },
] as const;

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
}: TransactionWizardProps) {
  const [step, setStep] = useState(0);
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
  const [repeats, setRepeats] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("dayOfMonth");
  const [scheduleN, setScheduleN] = useState(() => Number(occurredOn.slice(8, 10)) || 1);
  const [hasEnd, setHasEnd] = useState(false);
  const [endOn, setEndOn] = useState(today);
  const [problem, setProblem] = useState<string | null>(null);

  const selectedMethod = paymentMethods.find((method) => method.id === paymentMethodId) ?? null;
  const showsCashback = offersCashback(selectedMethod?.kind ?? null, kind);
  const canConfigureRecurrence = editing === null;
  const steps = canConfigureRecurrence ? CREATE_STEPS : EDIT_STEPS;
  // Índices dependem do fluxo: na criação "Repetir" empurra categoria e pagamento.
  const categoryStep = canConfigureRecurrence ? 2 : 1;
  const paymentStep = canConfigureRecurrence ? 3 : 2;
  const recurrenceStep = 1;

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
  const categoryIsDead = categoryId !== null && chosenCategory === null;
  const methodIsDead = paymentMethodId !== null && selectedMethod === null;

  const trimmed = description.trim();
  // Valor inválido deixou de ser estado possível: a máscara só admite dígitos.
  const amountMinor = minorOf(amount);
  const detailsValid = trimmed !== "" && amountMinor > 0;
  // Depois de "Dados", o resto não bloqueia: repetir, categoria e pagamento são opcionais.
  const maxReachable = detailsValid ? steps.length - 1 : 0;
  const clampedN = Math.min(31, Math.max(1, Math.trunc(scheduleN) || 1));

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

  function recurrenceInput(): RecurrenceInput {
    return { frequency, scheduleType, scheduleN: clampedN, endOn: hasEnd ? endOn : null };
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!validateDetails()) {
      setStep(0);
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
        // na tela, presente no export, imortal no log append-only.
        // Campo vazio continua sendo `null`, não zero: "não houve cashback" e
        // "voltou R$ 0,00" são coisas diferentes, e o log guarda as duas.
        cashbackMinor: showsCashback && cashback !== "" ? minorOf(cashback) : null,
        occurredOn,
        // Avulso: a série e a competência só entram pela materialização.
        recurrenceId: editing?.recurrenceId ?? null,
        occurrenceKey: editing?.occurrenceKey ?? null,
      },
      canConfigureRecurrence && repeats ? recurrenceInput() : null,
    );
  }

  const isLast = step === steps.length - 1;
  const signed = signedBRL(kind === "expense" ? -amountMinor : amountMinor, "always");
  const dateWord = occurredOn === today ? "Hoje" : chipDate(occurredOn, today);
  const repeatWord = repeats
    ? FREQUENCY_LABELS[frequency].toLocaleLowerCase("pt-BR")
    : "não repete";
  const toneDot = (
    <span
      aria-hidden="true"
      class={`size-2 shrink-0 rounded-full ${kind === "expense" ? "bg-expense" : "bg-income"}`}
    />
  );
  const amountTone = kind === "income" ? "text-income-fg" : "";

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
                    onInput={(event) => setAmount(onlyDigits(event.currentTarget.value))}
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

            <div class="mt-5">
              <DateChips
                value={occurredOn}
                today={today}
                onCalendarToggle={setCalendarOpen}
                onChange={(next) => {
                  setOccurredOn(next);
                  // Na etapa Repetir, o dia default acompanha a data escolhida aqui.
                  if (!repeats) setScheduleN(Number(next.slice(8, 10)) || 1);
                }}
              />
            </div>

            {editing?.recurrenceId != null && (
              <p class={`${HINT} flex items-center gap-1.5`}>
                <Icon name="repeat" size={14} />
                Faz parte de uma série. Alterar aqui muda só esta ocorrência.
              </p>
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

            <div class="mt-4 rounded-lg bg-bg px-4 py-3">
              <Toggle
                label="Repetir este lançamento"
                hint={
                  repeats ? "Gera as próximas vezes sozinho." : "Sem repetir, acontece uma vez só."
                }
                checked={repeats}
                onChange={(on) => {
                  setRepeats(on);
                  if (on) setScheduleN(Number(occurredOn.slice(8, 10)) || 1);
                }}
              />
            </div>

            {repeats && (
              <div key="recurrence-fields" class="hf-disclose mt-5 space-y-5">
                <div>
                  <p class={LABEL}>Frequência</p>
                  <Segmented
                    name="frequency"
                    legend="Frequência"
                    dense
                    class="mt-2"
                    options={RECURRENCE_FREQUENCIES.map((value) => ({
                      value,
                      label: FREQUENCY_LABELS[value],
                    }))}
                    value={frequency}
                    onChange={setFrequency}
                  />
                </div>

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
                          onInput={(event) => setScheduleN(Number(event.currentTarget.value) || 1)}
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
              context={canConfigureRecurrence ? `${dateWord} · ${repeatWord}` : dateWord}
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
                      checked={paymentMethodId === method.id}
                      onSelect={() => setPaymentMethodId(method.id)}
                    />
                  ))}
                </div>
              )}
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
                    onInput={(event) => setCashback(onlyDigits(event.currentTarget.value))}
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

interface ChoiceProps {
  name: string;
  icon: string;
  /** `null` = opção neutra ("Sem categoria"). */
  color: string | null;
  checked: boolean;
  onSelect: () => void;
}

/**
 * Tile da grade de categoria (3 colunas, 80px): ícone em cima, nome embaixo.
 *
 * Rádio nativo escondido: o nome acessível é o texto do próprio `<label>`, então
 * nada de `aria-label` — ele venceria o texto e obrigaria a manter dois nomes.
 */
function CategoryTile({ name, icon, color, checked, onSelect }: ChoiceProps) {
  return (
    <label
      class={`hf-press flex h-20 cursor-pointer flex-col justify-between rounded-lg p-2.5
        has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
          checked ? "hf-selected" : "bg-bg hover:bg-fg/[0.04]"
        }`}
    >
      <input
        type="radio"
        name="categoryId"
        value={name}
        checked={checked}
        onChange={onSelect}
        class="sr-only"
      />
      <IconTile icon={icon} color={color} size={30} iconSize={17} />
      <span
        class={`truncate text-[12.5px] font-medium ${checked ? "text-accent-200" : "text-fg/85"}`}
      >
        {name}
      </span>
    </label>
  );
}

/** Linha de 52px da lista de pagamento: tile, nome e rádio à direita. */
function MethodRow({
  name,
  icon,
  color,
  checked,
  onSelect,
  first,
}: ChoiceProps & { first?: boolean }) {
  return (
    <label
      class="relative flex h-[52px] cursor-pointer items-center gap-3 px-3
        has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2
        has-[:focus-visible]:outline-accent hover:bg-fg/[0.03]"
    >
      {/* Régua recuada até o texto, que esmaece antes da borda. */}
      {!first && <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-[54px]" />}
      <input
        type="radio"
        name="paymentMethodId"
        value={name}
        checked={checked}
        onChange={onSelect}
        class="sr-only"
      />
      <IconTile icon={icon} color={color} size={30} iconSize={17} />
      <span class={`min-w-0 flex-1 truncate text-[15px] ${color === null ? "text-fg/60" : ""}`}>
        {name}
      </span>
      <span
        aria-hidden="true"
        class="size-5 shrink-0 rounded-full"
        style={{
          boxShadow: checked
            ? "inset 0 0 0 1.5px var(--color-accent), inset 0 0 0 5px var(--color-bg), inset 0 0 0 10px var(--color-accent)"
            : "inset 0 0 0 1.5px var(--color-neutral-700)",
        }}
      />
    </label>
  );
}
