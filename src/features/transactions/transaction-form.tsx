import { useState } from "preact/hooks";
import type { TransactionDraft, TransactionKind } from "../../domain/events/transaction";
import { parseBRL } from "../../domain/money/money";
import type { TransactionRecord } from "../../domain/projections/apply";

export interface TransactionFormProps {
  /**
   * Registro em edição, ou null para criação.
   *
   * O `App` monta este componente com `key` derivada do registro: trocar de
   * registro remonta o formulário, e os inicializadores de `useState` acima
   * releem as props. Não reintroduza um `useEffect` de reset — ele roda depois
   * do DOM ficar consultável e sobrescreve o que o usuário já digitou.
   */
  editing: TransactionRecord | null;
  onSubmit: (draft: TransactionDraft) => void;
  onCancel: () => void;
  today: string;
}

const LABEL = "hf-caption block text-[0.6875rem] font-semibold uppercase text-base-content/45";
const FIELD =
  "rounded-field mt-1.5 w-full bg-base-200 px-3.5 py-2.5 text-base outline-none " +
  "transition-[box-shadow,background-color] duration-150 " +
  "focus-visible:bg-base-100 focus-visible:ring-2 focus-visible:ring-primary/45";

/**
 * O tipo é a escolha mais consequente do formulário e só tem duas opções:
 * um segmented control mostra as duas de uma vez, enquanto um `select` esconde
 * metade da decisão atrás de um toque.
 */
const SEGMENT =
  "hf-press rounded-field flex-1 cursor-pointer py-2 text-center text-sm font-medium " +
  "transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

const KINDS = [
  { value: "expense", label: "Despesa", tone: "text-error" },
  { value: "income", label: "Receita", tone: "text-success" },
] as const satisfies ReadonlyArray<{ value: TransactionKind; label: string; tone: string }>;

function toAmountInput(minor: number): string {
  return (minor / 100).toFixed(2).replace(".", ",");
}

export function TransactionForm({ editing, onSubmit, onCancel, today }: TransactionFormProps) {
  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(editing === null ? "" : toAmountInput(editing.amountMinor));
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? "expense");
  const [occurredOn, setOccurredOn] = useState(editing?.occurredOn ?? today);
  const [problem, setProblem] = useState<string | null>(null);

  function handleSubmit(event: Event) {
    event.preventDefault();

    const trimmed = description.trim();
    if (trimmed === "") {
      setProblem("Informe uma descrição.");
      return;
    }

    const amountMinor = parseBRL(amount);
    if (amountMinor === null || amountMinor === 0) {
      setProblem("Informe um valor maior que zero.");
      return;
    }

    setProblem(null);
    onSubmit({
      kind,
      description: trimmed,
      amountMinor,
      currency: "BRL",
      categoryId: null,
      paymentMethodId: null,
      cashbackMinor: null,
      occurredOn,
    });

    // Numa criação o formulário continua montado com `editing` em null, então o
    // efeito acima não roda: limpar aqui é o que evita o campo preenchido de novo.
    if (editing === null) {
      setDescription("");
      setAmount("");
    }
  }

  return (
    <form onSubmit={handleSubmit} class="rounded-box mt-4 bg-base-100 p-4">
      <h2 class="hf-title text-[0.9375rem] font-semibold">
        {editing === null ? "Novo lançamento" : "Editar lançamento"}
      </h2>

      <fieldset class="mt-3">
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

      {problem !== null && (
        <p role="alert" class="mt-3 text-sm text-error">
          {problem}
        </p>
      )}

      <div class="mt-4 flex gap-2">
        <button
          type="submit"
          class="hf-press rounded-field flex-1 bg-primary py-2.5 font-medium text-primary-content"
        >
          {editing === null ? "Adicionar" : "Salvar"}
        </button>
        {editing !== null && (
          <button
            type="button"
            onClick={onCancel}
            class="hf-press rounded-field bg-base-200 px-4 py-2.5 font-medium text-base-content/70"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
