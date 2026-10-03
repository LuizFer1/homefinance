import { useState } from "preact/hooks";
import type { Transaction } from "../../domain/model/transaction";
import { MAX_MINOR, maskDigits, minorOf, onlyDigits } from "../../domain/money/mask";
import { formatBRL } from "../../domain/money/money";
import { Button } from "../ui/button";
import { DateButton } from "../ui/date-field";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { SheetHeader } from "../ui/modal";
import { periodLabel } from "./adjust-sheet";

export interface ConfirmSheetProps {
  /** A ocorrência estimada. */
  record: Transaction;
  today: string;
  onConfirm: (actual: Pick<Transaction, "amountMinor" | "occurredOn">) => void;
  onClose: () => void;
}

/**
 * Confirmar o valor real de uma estimativa: valor e data, já preenchidos com
 * os da estimativa. Conta que veio igual ao palpite se confirma com um toque.
 *
 * A data é editável porque a ração não tem dia: a ocorrência nasce no dia
 * escolhido para a série, e a compra de verdade foi quando o saco acabou.
 */
export function ConfirmSheet({ record, today, onConfirm, onClose }: ConfirmSheetProps) {
  const [amount, setAmount] = useState(String(record.amountMinor));
  const [occurredOn, setOccurredOn] = useState(record.occurredOn);
  const amountMinor = minorOf(amount);
  const valid = amountMinor > 0 && amountMinor <= MAX_MINOR;

  return (
    <div class="flex flex-col">
      <SheetHeader title="Confirmar valor" onClose={onClose} />

      <p class="mt-4 text-sm text-fg/70">
        {record.description} · {periodLabel(record.occurredOn.slice(0, 7))} · estimado{" "}
        <span class="hf-num text-fg">~{formatBRL(record.amountMinor)}</span>
      </p>

      <div class="mt-5">
        <label class={LABEL} for="confirm-amount">
          Valor real
        </label>
        <input
          id="confirm-amount"
          type="text"
          inputMode="numeric"
          autocomplete="off"
          placeholder="0,00"
          value={maskDigits(amount)}
          onInput={(event) => setAmount(onlyDigits(event.currentTarget.value))}
          class={`${FIELD_SHEET} hf-num mt-2`}
        />
        <p class={HINT}>Entra na média das próximas estimativas.</p>
      </div>

      <div class="mt-4">
        <DateButton
          id="confirm-date"
          label="Data"
          value={occurredOn}
          today={today}
          onChange={setOccurredOn}
        />
      </div>

      <Button
        class="mt-5 w-full"
        icon="check"
        disabled={!valid}
        onClick={() => onConfirm({ amountMinor, occurredOn })}
      >
        Confirmar
      </Button>
    </div>
  );
}
