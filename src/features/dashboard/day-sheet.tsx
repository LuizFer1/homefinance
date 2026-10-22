import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import type { Transaction } from "../../domain/model/transaction";
import { dayHeading } from "../../domain/projections/periods";
import { TransactionList } from "../transactions/transaction-list";
import { Modal, SheetHeader } from "../ui/modal";
import { brl } from "../ui/money";

export interface DaySheetProps {
  /** Dia aberto; `null` = fechado. */
  date: string | null;
  /** Despesas do dia, já recortadas por `expensesOn`. */
  items: Transaction[];
  state: AppState;
  today: string;
  currentUserId: Ulid | null;
  onEdit: (record: Transaction) => void;
  onClose: () => void;
}

/**
 * Lançamentos de um dia do mapa de calor.
 *
 * Uma etapa só, de propósito: é consulta de leitura, não formulário nem ação que
 * mude dados — a regra de várias etapas vale para esses. Tocar numa linha fecha
 * o sheet e abre a edição.
 */
export function DaySheet({
  date,
  items,
  state,
  today,
  currentUserId,
  onEdit,
  onClose,
}: DaySheetProps) {
  const total = items.reduce((sum, item) => sum + item.amountMinor, 0);
  const title = date === null ? "Dia" : dayHeading(date, today);

  return (
    <Modal open={date !== null} title={title} onClose={onClose}>
      <SheetHeader title={title} onClose={onClose} />
      {items.length === 0 ? (
        <p class="mt-4 text-sm text-fg/60">Nenhuma saída neste dia.</p>
      ) : (
        <>
          <p class="mt-1 text-[13px] text-fg/60">
            {items.length} {items.length === 1 ? "saída" : "saídas"} · {brl(total)}
          </p>
          <TransactionList
            items={items}
            state={state}
            today={today}
            currentUserId={currentUserId}
            onEdit={(record) => {
              onClose();
              onEdit(record);
            }}
          />
        </>
      )}
    </Modal>
  );
}
