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
import { offersCashback } from "../../domain/transactions/cashback";
import { EntityPicker } from "../registry/entity-picker";
import { DateField } from "../ui/date-field";
import { FIELD, FIELD_BOX, LABEL } from "../ui/field";
import { StepIndicator } from "./step-indicator";

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
}

/**
 * Criação tem etapa própria de recorrência; edição não — alterar a série não é
 * o mesmo que editar uma ocorrência, e misturar os dois no mesmo fluxo esconderia
 * qual decisão o usuário está tomando.
 */
const CREATE_STEPS = ["Dados", "Repetir", "Categoria", "Pagamento"] as const;
const EDIT_STEPS = ["Dados", "Categoria", "Pagamento"] as const;

const SEGMENT =
  "hf-press rounded-field flex-1 cursor-pointer py-2 text-center text-sm font-medium " +
  "transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";
const ACTION = "hf-press rounded-field px-4 py-2.5 font-medium";

const KINDS = [
  { value: "expense", label: "Despesa", tone: "text-error" },
  { value: "income", label: "Receita", tone: "text-success" },
] as const satisfies ReadonlyArray<{ value: TransactionKind; label: string; tone: string }>;

interface MoneyFieldProps {
  id: string;
  label: string;
  /** Dígitos crus, não o texto exibido — ver `domain/money/mask.ts`. */
  digits: string;
  onDigits: (digits: string) => void;
}

/**
 * Campo de dinheiro com máscara de centavos.
 *
 * O "R$" é irmão do input, nunca parte do valor: dentro dele voltaria pelo
 * `onlyDigits` a cada tecla e teria que ser removido de novo antes do draft.
 *
 * `inputMode="numeric"` e não `"decimal"` porque a vírgula deixou de existir
 * para quem digita — um teclado que a ofereça convida a uma tecla que a máscara
 * descarta.
 */
function MoneyField({ id, label, digits, onDigits }: MoneyFieldProps) {
  return (
    <div>
      <label class={LABEL} for={id}>
        {label}
      </label>
      <div class="relative mt-1.5">
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm
            text-base-content/45"
        >
          R$
        </span>
        <input
          id={id}
          name={id}
          type="text"
          inputMode="numeric"
          autocomplete="off"
          placeholder="0,00"
          class={`${FIELD_BOX} hf-num pl-9`}
          value={maskDigits(digits)}
          onInput={(event) => onDigits(onlyDigits(event.currentTarget.value))}
        />
      </div>
    </div>
  );
}

/**
 * Formulário de lançamento em etapas.
 *
 * A wizard guarda o rascunho inteiro e emite **um único submit**, no fim. Isso não
 * é preferência de estilo: a regra do cashback depende de dois eixos que vivem em
 * etapas diferentes — o tipo do lançamento e a forma de pagamento. Com submit por
 * etapa, voltar e trocar para receita deixaria de limpar o cashback, que é
 * exatamente o dado sujo permanente que a regra existe para prevenir.
 *
 * Recorrência é etapa própria na criação: frequência e condição de data não
 * cabem no "Dados" sem empurrar valor e calendário para baixo do dedo.
 */
export function TransactionWizard({
  editing,
  onSubmit,
  onCancel,
  today,
  initialKind,
  categories,
  paymentMethods,
}: TransactionWizardProps) {
  const [step, setStep] = useState(0);
  const [description, setDescription] = useState(editing?.description ?? "");
  // Dígitos, não texto formatado: a máscara é quem decide como o número aparece.
  const [amount, setAmount] = useState(editing === null ? "" : String(editing.amountMinor));
  // Na edição o registro manda; na criação, o botão que abriu o modal.
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? initialKind ?? "expense");
  const [occurredOn, setOccurredOn] = useState(editing?.occurredOn ?? today);
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
    receita na etapa 1 troca a lista da etapa 2. "Salário" oferecido numa despesa
    é a razão de `kind` existir na categoria.

    A escolha já feita **não** é limpa ao trocar o tipo — isso apagaria em
    silêncio uma decisão do usuário por causa de um toque no segmento. Ela é
    reanexada à grade: sem isso o `EntityPicker` a trataria como referência
    morta e a rotularia "Categoria removida", que seria mentira — a categoria
    existe, só não serve a este lado do lançamento.
  */
  const offered = categories.filter(
    (category) => category.kind === kind || category.kind === "both",
  );
  const chosenCategory = categories.find((category) => category.id === categoryId) ?? null;
  const categoryItems =
    chosenCategory !== null && !offered.some((category) => category.id === chosenCategory.id)
      ? [...offered, chosenCategory]
      : offered;

  const trimmed = description.trim();
  // Valor inválido deixou de ser estado possível: a máscara só admite dígitos.
  const amountMinor = minorOf(amount);
  const detailsValid = trimmed !== "" && amountMinor > 0;
  // Depois de "Dados", o resto não bloqueia: repetir, categoria e pagamento são opcionais.
  const maxReachable = detailsValid ? steps.length - 1 : 0;

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
    setStep(index);
  }

  function recurrenceInput(): RecurrenceInput {
    const n = Math.min(31, Math.max(1, Math.trunc(scheduleN) || 1));
    return {
      frequency,
      scheduleType,
      scheduleN: n,
      endOn: hasEnd ? endOn : null,
    };
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
        // "voltou R$ 0,00" são coisas diferentes, e o log guarda as duas para sempre.
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

  return (
    <form onSubmit={handleSubmit} class="p-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="hf-title font-semibold">
          {editing === null ? "Novo lançamento" : "Editar lançamento"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fechar"
          class="hf-press rounded-field px-2 py-1 text-lg leading-none text-base-content/45"
        >
          &times;
        </button>
      </div>

      <div class="mt-4">
        <StepIndicator steps={steps} current={step} maxReachable={maxReachable} onGo={goTo} />
      </div>

      {/*
        A `key` no invólucro é o que faz a etapa remontar, e é a remontagem que
        dispara o `@starting-style`. Sem ela o Preact reaproveitaria o nó e a
        troca continuaria instantânea.

        140ms e só 6px: lançar é o laço diário do app, e são duas trocas por
        lançamento. Qualquer coisa mais longa vira imposto cobrado toda vez.
      */}
      <div
        key={step}
        class="mt-5 transition-[opacity,translate] duration-[140ms] ease-out-soft
          starting:translate-x-1.5 starting:opacity-0"
      >
        {step === 0 && (
          <>
            <fieldset>
              <legend class="sr-only">Tipo</legend>
              <div class="rounded-field flex gap-1.5 bg-base-200 p-1">
                {KINDS.map(({ value, label, tone }) => (
                  <label
                    key={value}
                    class={`${SEGMENT} ${
                      kind === value ? `bg-base-100 shadow-sm ${tone}` : "text-base-content/55"
                    }`}
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={value}
                      checked={kind === value}
                      onChange={() => setKind(value)}
                      class="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div class="mt-3">
              <label class={LABEL} for="description">
                Descrição
              </label>
              <input
                id="description"
                name="description"
                type="text"
                autocomplete="off"
                placeholder="Mercado, aluguel, salário..."
                class={FIELD}
                value={description}
                onInput={(event) => setDescription(event.currentTarget.value)}
              />
            </div>

            <div class="mt-3 grid grid-cols-2 items-start gap-3">
              <MoneyField id="amount" label="Valor" digits={amount} onDigits={setAmount} />

              {/*
                O painel do calendário é irmão do gatilho e ocupa as duas
                colunas: aberto, ele empurra o formulário em vez de flutuar sobre
                ele — ver o comentário em `date-field.tsx`.
              */}
              <DateField
                id="occurredOn"
                label="Data"
                value={occurredOn}
                today={today}
                onChange={(next) => {
                  setOccurredOn(next);
                  // Na etapa Repetir, o N default já acompanha o dia escolhido aqui.
                  if (!repeats) setScheduleN(Number(next.slice(8, 10)) || 1);
                }}
              />
            </div>

            {editing?.recurrenceId != null && (
              <p class="mt-3 text-xs text-base-content/45">
                Este lançamento faz parte de uma série. Alterar aqui muda só esta ocorrência.
              </p>
            )}
          </>
        )}

        {canConfigureRecurrence && step === recurrenceStep && (
          <fieldset>
            {/*
              O indicador já diz "Repetir"; outro caption em caixa alta
              ("RECORRÊNCIA") competia com o step e com o título do modal.
              A pergunta em frase e o corpo em 15px são a hierarquia da etapa.
            */}
            <legend class="sr-only">Recorrência</legend>
            <h3 class="hf-title text-base font-semibold leading-snug text-base-content">
              Este lançamento se repete?
            </h3>
            <p class="mt-1.5 max-w-[22rem] text-[0.9375rem] leading-snug text-base-content/55">
              Opcional. Sem repetir, ele acontece uma vez só na data escolhida.
            </p>

            <label class="mt-5 flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span class="text-[0.9375rem] font-medium leading-snug text-base-content">
                Repetir este lançamento
              </span>
              <input
                type="checkbox"
                checked={repeats}
                onChange={(event) => {
                  const on = event.currentTarget.checked;
                  setRepeats(on);
                  if (on) setScheduleN(Number(occurredOn.slice(8, 10)) || 1);
                }}
                class="size-4 shrink-0 accent-primary"
              />
            </label>

            {repeats && (
              /*
                Disclosure dos campos: evita o salto seco de "apareceu um bloco".
                Stagger curto (40ms) — legível, não coreográfico. `key` força a
                remontagem se o usuário desligar e ligar de novo.
              */
              <div key="recurrence-fields" class="hf-disclose hf-disclose-stagger mt-5 space-y-4">
                <div>
                  <label class={LABEL} for="recurrence-frequency">
                    Frequência
                  </label>
                  <select
                    id="recurrence-frequency"
                    class={FIELD}
                    value={frequency}
                    onChange={(event) =>
                      setFrequency(event.currentTarget.value as RecurrenceFrequency)
                    }
                  >
                    {RECURRENCE_FREQUENCIES.map((value) => (
                      <option key={value} value={value}>
                        {FREQUENCY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label class={LABEL} for="recurrence-schedule-type">
                    Quando no período
                  </label>
                  <select
                    id="recurrence-schedule-type"
                    class={FIELD}
                    value={scheduleType}
                    onChange={(event) => setScheduleType(event.currentTarget.value as ScheduleType)}
                  >
                    {SCHEDULE_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {SCHEDULE_TYPE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label class={LABEL} for="recurrence-schedule-n">
                    {scheduleType === "nthBusinessDay" ? "Nº do dia útil" : "Dia do mês"}
                  </label>
                  <input
                    id="recurrence-schedule-n"
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    class={FIELD}
                    value={scheduleN}
                    onInput={(event) => setScheduleN(Number(event.currentTarget.value) || 1)}
                  />
                  <p class="mt-1.5 text-sm leading-snug text-base-content/50">
                    {scheduleType === "nthBusinessDay"
                      ? "Dia útil = segunda a sexta (sem feriados nesta versão)."
                      : "Se o mês for mais curto, usa o último dia."}
                  </p>
                </div>

                <label class="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                  <span class="text-[0.9375rem] leading-snug text-base-content/80">
                    Tem data final
                  </span>
                  <input
                    type="checkbox"
                    checked={hasEnd}
                    onChange={(event) => setHasEnd(event.currentTarget.checked)}
                    class="size-4 shrink-0 accent-primary"
                  />
                </label>

                {hasEnd && (
                  <div key="recurrence-end" class="hf-disclose">
                    <DateField
                      id="recurrence-end"
                      label="Termina em"
                      value={endOn}
                      today={today}
                      onChange={setEndOn}
                    />
                  </div>
                )}
              </div>
            )}
          </fieldset>
        )}

        {step === categoryStep && (
          <EntityPicker
            id="categoryId"
            label="Categoria"
            emptyLabel="Sem categoria"
            emptyHint="Nenhuma categoria ainda. Cadastre em Categorias."
            items={categoryItems}
            value={categoryId}
            deadLabel="Categoria removida"
            onChange={setCategoryId}
          />
        )}

        {step === paymentStep && (
          <>
            <EntityPicker
              id="paymentMethodId"
              label="Forma de pagamento"
              emptyLabel="Sem forma de pagamento"
              emptyHint="Nenhuma forma de pagamento ainda. Cadastre em Pagamentos."
              items={paymentMethods}
              value={paymentMethodId}
              deadLabel="Forma removida"
              onChange={setPaymentMethodId}
            />

            {showsCashback && (
              <div class="mt-3">
                <MoneyField
                  id="cashback"
                  label="Cashback"
                  digits={cashback}
                  onDigits={setCashback}
                />
                <p class="mt-1.5 text-xs text-base-content/45">
                  Quanto voltou. Não entra no saldo — é um atributo da despesa.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {problem !== null && (
        <p role="alert" class="mt-3 text-sm text-error">
          {problem}
        </p>
      )}

      <div class="mt-5 flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            class={`${ACTION} bg-base-200 text-base-content/70`}
          >
            Voltar
          </button>
        )}

        {/*
          As `key` distintas não são decoração — ver o comentário gêmeo em
          `registry-wizard.tsx`. Sem elas o Preact reaproveita o nó e só troca o
          `type`; como o navegador executa a activation behavior depois do
          handler, o clique em "Continuar" gravava o lançamento em vez de avançar.
        */}
        {isLast ? (
          <button
            key="enviar"
            type="submit"
            class={`${ACTION} flex-1 bg-primary text-primary-content`}
          >
            {editing === null ? "Adicionar" : "Salvar"}
          </button>
        ) : (
          <button
            key="avancar"
            type="button"
            onClick={() => goTo(step + 1)}
            class={`${ACTION} flex-1 bg-primary text-primary-content`}
          >
            Continuar
          </button>
        )}
      </div>
    </form>
  );
}
