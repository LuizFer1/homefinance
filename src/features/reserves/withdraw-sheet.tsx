import { useState } from "preact/hooks";
import type { AppState } from "../../domain/model/app-state";
import type { Reserve, ReserveMovement, WithdrawReason } from "../../domain/model/reserve";
import { WITHDRAW_REASON_LABELS, WITHDRAW_REASONS } from "../../domain/model/reserve";
import { MAX_MINOR, minorOf } from "../../domain/money/mask";
import { formatBRL } from "../../domain/money/money";
import { monthOf } from "../../domain/projections/periods";
import { actsAsEmergency, reserveBalance } from "../../domain/reserves/balances";
import { emergencyTarget } from "../../domain/reserves/essential";
import { formatMonths, monthsCovered } from "../../domain/reserves/goals";
import { Icon } from "../icons/icon";
import { LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { SheetHeader } from "../ui/modal";
import { wholeBRL } from "../ui/money";
import { monthName } from "./format";
import { MonthsMeter } from "./months-meter";
import { AmountField, SheetSubtitle } from "./sheet-parts";
import type { MovementInput } from "./store";

export interface WithdrawSheetProps {
  state: AppState;
  reserve: Reserve;
  today: string;
  editing: ReserveMovement | null;
  onSubmit: (input: MovementInput & { reason: WithdrawReason }) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Motivo gravado desconhecido (versão futura) vira "Outro": melhor que obrigar a escolher de novo. */
function initialReason(editing: ReserveMovement | null): WithdrawReason | null {
  if (editing === null || editing.reason === null) return null;
  return (WITHDRAW_REASONS as readonly string[]).includes(editing.reason)
    ? editing.reason
    : "other";
}

/** 2d: retirar de uma reserva, sempre com motivo (ou editar uma retirada). */
export function WithdrawSheet({
  state,
  reserve,
  today,
  editing,
  onSubmit,
  onDelete,
  onClose,
}: WithdrawSheetProps) {
  const occurredOn = editing?.occurredOn ?? today;
  const [digits, setDigits] = useState(
    editing === null ? "" : String(Math.abs(editing.amountMinor)),
  );
  const [reason, setReason] = useState<WithdrawReason | null>(initialReason(editing));
  const [description, setDescription] = useState(editing?.description ?? "");

  const amount = minorOf(digits);
  // Editar devolve a retirada original ao saldo antes de comparar: senão não daria
  // para corrigir uma retirada que já esvaziou a reserva.
  const available = reserveBalance(state, reserve.id) + Math.abs(editing?.amountMinor ?? 0);
  const over = amount > available;
  const valid = amount > 0 && amount <= MAX_MINOR && !over && reason !== null;
  // Acima do saldo o erro já avisa; a prévia não mostra saldo ou meses negativos.
  const after = Math.max(0, available - amount);
  const returned = Math.min(amount, available);
  const emergency = actsAsEmergency(state, reserve);
  const goal = emergency ? emergencyTarget(state, reserve, today) : null;

  return (
    <div class="flex flex-col">
      <SheetHeader
        title={editing === null ? "Retirar" : "Editar retirada"}
        onClose={onClose}
        actions={
          editing === null ? undefined : (
            <HoldToDelete label="Excluir retirada" onConfirm={onDelete} />
          )
        }
      />
      <SheetSubtitle reserve={reserve} isEmergency={emergency} prefix="Da" />

      <AmountField
        id="withdraw-amount"
        digits={digits}
        onDigits={setDigits}
        describedBy={over ? "withdraw-error" : undefined}
      />
      {over && (
        <p id="withdraw-error" class="mt-2 text-[13px] text-expense-fg">
          Maior que o saldo da reserva
        </p>
      )}

      <fieldset class="mt-[18px] border-0 p-0">
        <legend class={`${LABEL} p-0`}>Para quê?</legend>
        <div class="mt-2 flex flex-wrap gap-2">
          {WITHDRAW_REASONS.map((value) => (
            // Pílula de 36px do handoff: o `RadioChip` compartilhado é 40px e raio 8, então o
            // rádio nativo (foco, setas, leitor de tela) fica e só o desenho é próprio.
            <label
              key={value}
              class={`hf-press flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-sm
                has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  reason === value
                    ? "border-accent bg-accent-900 text-accent-200"
                    : "border-divider text-fg/80"
                }`}
            >
              <input
                type="radio"
                name="withdraw-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                class="sr-only"
              />
              {WITHDRAW_REASON_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <div class="mt-2 flex h-12 items-center gap-2 rounded-lg border border-divider bg-bg px-3.5 focus-within:border-accent">
        <Icon name="pencil-simple" size={16} class="shrink-0 text-fg/60" />
        <input
          type="text"
          aria-label="Descrição"
          placeholder="Descrição (opcional)"
          autocomplete="off"
          value={description}
          onInput={(event) => setDescription(event.currentTarget.value)}
          class="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg/40"
        />
      </div>

      <div class="mt-4 rounded-lg bg-bg p-3.5">
        <div class="hf-num flex justify-between text-[13px]">
          <span>Depois da retirada</span>
          <span class="font-medium">{formatBRL(after)}</span>
        </div>
        {goal !== null && (
          <div class="mt-2.5">
            <MonthsMeter
              months={monthsCovered(after, goal.costMinor)}
              removedMonths={monthsCovered(returned, goal.costMinor)}
              height={8}
            />
          </div>
        )}
        <div class="hf-num mt-2 flex justify-between gap-3 text-xs">
          {goal !== null && (
            <span class="font-medium text-accent-300">
              Cobre {formatMonths(monthsCovered(after, goal.costMinor))} meses
            </span>
          )}
          <span class="ml-auto text-right text-fg/55">
            volta {returned % 100 === 0 ? wholeBRL(returned) : formatBRL(returned)} ao saldo de{" "}
            {monthName(monthOf(occurredOn))}
          </span>
        </div>
      </div>

      <div class="sticky bottom-0 -mx-5 mt-5 bg-surface px-5 pt-2">
        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            if (reason === null) return;
            const text = description.trim();
            onSubmit({
              amountMinor: amount,
              description: text === "" ? null : text,
              occurredOn,
              reason,
            });
          }}
          class="hf-press inline-flex h-[52px] w-full min-w-0 items-center justify-center gap-2
          rounded-lg border border-expense/55 bg-expense/[0.09] px-5 text-[15px] font-medium
          text-expense-fg hover:bg-expense/[0.16] disabled:pointer-events-none disabled:opacity-45"
        >
          <Icon name="arrow-up" size={18} />
          <span class="truncate">Retirar {formatBRL(amount)}</span>
        </button>
      </div>
    </div>
  );
}
