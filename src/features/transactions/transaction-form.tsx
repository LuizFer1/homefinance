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
    <form onSubmit={handleSubmit}>
      <h2>{editing === null ? "Novo lançamento" : "Editar lançamento"}</h2>

      <p>
        <label for="description">Descrição</label>
        <input
          id="description"
          name="description"
          type="text"
          value={description}
          onInput={(event) => setDescription(event.currentTarget.value)}
        />
      </p>

      <p>
        <label for="amount">Valor</label>
        <input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onInput={(event) => setAmount(event.currentTarget.value)}
        />
      </p>

      <p>
        <label for="kind">Tipo</label>
        <select
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.currentTarget.value as TransactionKind)}
        >
          <option value="expense">Despesa</option>
          <option value="income">Receita</option>
        </select>
      </p>

      <p>
        <label for="occurredOn">Data</label>
        <input
          id="occurredOn"
          name="occurredOn"
          type="date"
          value={occurredOn}
          onInput={(event) => setOccurredOn(event.currentTarget.value)}
        />
      </p>

      {problem !== null && <p role="alert">{problem}</p>}

      <button type="submit">{editing === null ? "Adicionar" : "Salvar"}</button>
      {editing !== null && (
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      )}
    </form>
  );
}
