import { useState } from "preact/hooks";
import type { TransactionDraft, TransactionKind } from "../../domain/events/transaction";
import type { Ulid } from "../../domain/ids/ulid";
import { parseBRL } from "../../domain/money/money";
import type {
  CategoryRecord,
  PaymentMethodRecord,
  TransactionRecord,
} from "../../domain/projections/apply";
import { offersCashback } from "../../domain/transactions/cashback";
import { EntitySelect } from "../registry/entity-select";
import { StepIndicator } from "./step-indicator";

export interface TransactionWizardProps {
  /** Registro em edição, ou null para criação. Montado com `key` pelo App. */
  editing: TransactionRecord | null;
  onSubmit: (draft: TransactionDraft) => void;
  onCancel: () => void;
  today: string;
  /** Tipo pré-selecionado na criação. Ignorado na edição, onde o registro manda. */
  initialKind?: TransactionKind;
  categories: CategoryRecord[];
  paymentMethods: PaymentMethodRecord[];
}

const STEPS = ["Dados", "Categoria", "Pagamento"] as const;

const LABEL = "hf-caption block text-[0.6875rem] font-semibold uppercase text-base-content/45";
const FIELD =
  "rounded-field mt-1.5 w-full bg-base-200 px-3.5 py-2.5 text-base outline-none " +
  "transition-[box-shadow,background-color] duration-150 " +
  "focus-visible:bg-base-100 focus-visible:ring-2 focus-visible:ring-primary/45";
const SEGMENT =
  "hf-press rounded-field flex-1 cursor-pointer py-2 text-center text-sm font-medium " +
  "transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";
const ACTION = "hf-press rounded-field px-4 py-2.5 font-medium";

const KINDS = [
  { value: "expense", label: "Despesa", tone: "text-error" },
  { value: "income", label: "Receita", tone: "text-success" },
] as const satisfies ReadonlyArray<{ value: TransactionKind; label: string; tone: string }>;

function toAmountInput(minor: number): string {
  return (minor / 100).toFixed(2).replace(".", ",");
}

/**
 * Formulário de lançamento em três etapas.
 *
 * A wizard guarda o rascunho inteiro e emite **um único submit**, no fim. Isso não
 * é preferência de estilo: a regra do cashback depende de dois eixos que vivem em
 * etapas diferentes — o tipo do lançamento na etapa 1, a forma de pagamento na 3.
 * Com submit por etapa, voltar à etapa 1 e trocar para receita deixaria de limpar
 * o cashback, que é exatamente o dado sujo permanente que a regra existe para
 * prevenir.
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
  const [amount, setAmount] = useState(editing === null ? "" : toAmountInput(editing.amountMinor));
  // Na edição o registro manda; na criação, o botão que abriu o modal.
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? initialKind ?? "expense");
  const [occurredOn, setOccurredOn] = useState(editing?.occurredOn ?? today);
  const [categoryId, setCategoryId] = useState<Ulid | null>(editing?.categoryId ?? null);
  const [paymentMethodId, setPaymentMethodId] = useState<Ulid | null>(
    editing?.paymentMethodId ?? null,
  );
  const [cashback, setCashback] = useState(
    editing?.cashbackMinor == null ? "" : toAmountInput(editing.cashbackMinor),
  );
  const [problem, setProblem] = useState<string | null>(null);

  const selectedMethod = paymentMethods.find((method) => method.id === paymentMethodId) ?? null;
  const showsCashback = offersCashback(selectedMethod?.kind ?? null, kind);

  const trimmed = description.trim();
  const amountMinor = parseBRL(amount);
  const detailsValid = trimmed !== "" && amountMinor !== null && amountMinor > 0;
  // Etapas 2 e 3 nunca bloqueiam: categoria e forma de pagamento são opcionais.
  const maxReachable = detailsValid ? STEPS.length - 1 : 0;

  function validateDetails(): boolean {
    if (trimmed === "") {
      setProblem("Informe uma descrição.");
      return false;
    }
    if (amountMinor === null || amountMinor === 0) {
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

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!validateDetails()) {
      setStep(0);
      return;
    }
    if (amountMinor === null) return;

    onSubmit({
      kind,
      description: trimmed,
      amountMinor,
      currency: "BRL",
      categoryId,
      paymentMethodId,
      // A limpeza acontece aqui, no draft, e não escondendo o campo. Um cashback
      // pendurado numa despesa em dinheiro seria dado sujo permanente: invisível
      // na tela, presente no export, imortal no log append-only.
      cashbackMinor: showsCashback ? parseBRL(cashback) : null,
      occurredOn,
    });
  }

  const isLast = step === STEPS.length - 1;

  return (
    <form onSubmit={handleSubmit} class="p-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="hf-title text-[0.9375rem] font-semibold">
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
        <StepIndicator steps={STEPS} current={step} maxReachable={maxReachable} onGo={goTo} />
      </div>

      <div class="mt-5">
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

            <div class="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label class={LABEL} for="amount">
                  Valor
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  class={`${FIELD} hf-num`}
                  value={amount}
                  onInput={(event) => setAmount(event.currentTarget.value)}
                />
              </div>
              <div>
                <label class={LABEL} for="occurredOn">
                  Data
                </label>
                <input
                  id="occurredOn"
                  name="occurredOn"
                  type="date"
                  class={`${FIELD} hf-num`}
                  value={occurredOn}
                  onInput={(event) => setOccurredOn(event.currentTarget.value)}
                />
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <EntitySelect
            id="categoryId"
            label="Categoria"
            emptyLabel="Sem categoria"
            emptyHint="Nenhuma categoria ainda. Cadastre em Categorias."
            items={categories}
            value={categoryId}
            deadLabel="Categoria removida"
            onChange={setCategoryId}
          />
        )}

        {step === 2 && (
          <>
            <EntitySelect
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
                <label class={LABEL} for="cashback">
                  Cashback
                </label>
                <input
                  id="cashback"
                  name="cashback"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  class={`${FIELD} hf-num`}
                  value={cashback}
                  onInput={(event) => setCashback(event.currentTarget.value)}
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

        {isLast ? (
          <button type="submit" class={`${ACTION} flex-1 bg-primary text-primary-content`}>
            {editing === null ? "Adicionar" : "Salvar"}
          </button>
        ) : (
          <button
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
