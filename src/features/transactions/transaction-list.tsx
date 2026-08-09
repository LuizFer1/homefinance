import type { Ulid } from "../../domain/ids/ulid";
import { formatBRL } from "../../domain/money/money";
import type { TransactionRecord } from "../../domain/projections/apply";

export interface TransactionListProps {
  /** Já filtrados e ordenados por `listTransactions`. */
  items: TransactionRecord[];
  onEdit: (record: TransactionRecord) => void;
  onDelete: (entityId: Ulid) => void;
}

export function TransactionList({ items, onEdit, onDelete }: TransactionListProps) {
  if (items.length === 0) {
    return <p>Nenhum lançamento ainda.</p>;
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <time dateTime={item.occurredOn}>{item.occurredOn}</time>
          <span>{item.description}</span>
          <span>
            {item.kind === "income" ? "+" : "-"}
            {formatBRL(item.amountMinor)}
          </span>
          <button
            type="button"
            aria-label={`Editar ${item.description}`}
            onClick={() => onEdit(item)}
          >
            Editar
          </button>
          <button
            type="button"
            aria-label={`Excluir ${item.description}`}
            onClick={() => onDelete(item.id)}
          >
            Excluir
          </button>
        </li>
      ))}
    </ul>
  );
}
