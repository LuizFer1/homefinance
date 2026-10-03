import { useState } from "preact/hooks";
import { dayOfMonthClamped } from "../../domain/dates/business-day";
import { shiftMonth } from "../../domain/dates/calendar";
import type { AppState } from "../../domain/model/app-state";
import type { Reserve, ReserveMovement } from "../../domain/model/reserve";
import { MAX_MINOR, maskDigits, minorOf, onlyDigits } from "../../domain/money/mask";
import { formatBRL } from "../../domain/money/money";
import { monthLabelLong, monthOf } from "../../domain/projections/periods";
import { monthBalance, reserveBalance } from "../../domain/reserves/balances";
import { depositId } from "../../domain/reserves/deposits";
import { emergencyTarget } from "../../domain/reserves/essential";
import { formatMonths, monthsCovered } from "../../domain/reserves/goals";
import { Icon } from "../icons/icon";
import { Button } from "../ui/button";
import { LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { SheetHeader } from "../ui/modal";
import { IconTile } from "../ui/tile";
import { Toggle } from "../ui/toggle";
import { movementDateLabel } from "./format";
import type { MovementInput } from "./store";

export interface DepositSheetProps {
  state: AppState;
  reserve: Reserve;
  today: string;
  /** Em edição: o movimento existente (sem toggle de recorrência, com HoldToDelete). */
  editing: ReserveMovement | null;
  onSubmit: (input: MovementInput, setRecurring: boolean | undefined) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Nome do mês sozinho, minúsculo ("setembro"): é o que o handoff escreve nas linhas. */
export function monthName(month: string): string {
  return monthLabelLong(month).split(" ")[0] ?? "";
}

/**
 * Valor do sheet: dígitos grandes (40px) com "R$" e sublinhado de acento.
 *
 * É um `<input>` de verdade e não texto desenhado com cursor falso: o teclado
 * numérico, a seleção e o leitor de tela dependem do campo real. O caret nativo
 * ganha a cor de acento para ficar com a cara do handoff.
 */
export function AmountField({
  id,
  digits,
  onDigits,
}: {
  id: string;
  digits: string;
  onDigits: (digits: string) => void;
}) {
  return (
    <>
      <label for={id} class={`${LABEL} mt-[18px]`}>
        Valor
      </label>
      <div class="hf-num mt-1 flex items-baseline gap-1.5 border-b border-accent pb-2.5">
        <span class="text-xl text-fg/55">R$</span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autocomplete="off"
          placeholder="0,00"
          value={maskDigits(digits)}
          onInput={(event) => onDigits(onlyDigits(event.currentTarget.value))}
          class="min-w-0 flex-1 bg-transparent text-[40px] leading-[48px] font-medium
            tracking-[-0.02em] caret-accent outline-none placeholder:text-fg/30"
        />
      </div>
    </>
  );
}

/** "Na Reserva de emergência" / "Da …": o ícone é o da identidade da reserva. */
export function SheetSubtitle({ reserve, prefix }: { reserve: Reserve; prefix: "Na" | "Da" }) {
  const icon = reserve.kind === "emergency" ? "lifebuoy" : reserve.icon;
  return (
    <p class="mt-0.5 flex items-center gap-1.5 text-[13px] text-fg/60">
      <Icon name={icon} size={14} class="text-accent-300" />
      {prefix} {reserve.name}
    </p>
  );
}

/**
 * Quando o depósito mensal cai de novo. Com a regra já ativa, o mês ainda sem
 * movimento e o dia por vir, é neste mês; em qualquer outro caso (acabou de
 * ligar, ou o mês já tem o depósito) é no mês seguinte. Sem regra o dia é o de
 * hoje, porque ligar o toggle faz este próprio depósito ser o do mês.
 */
function nextDepositLabel(state: AppState, reserve: Reserve, today: string): string {
  const month = monthOf(today);
  const day = reserve.recurring?.day ?? Number(today.slice(8, 10));
  const thisMonth = dayOfMonthClamped(month, day);
  const pending =
    reserve.recurring !== null &&
    state.reserveMovements[depositId(reserve.id, month)] === undefined &&
    thisMonth > today;
  const date = pending ? thisMonth : dayOfMonthClamped(shiftMonth(month, 1), day);
  return movementDateLabel(date);
}

/** 2c: guardar dinheiro do saldo do mês numa reserva (ou editar um guardado). */
export function DepositSheet({
  state,
  reserve,
  today,
  editing,
  onSubmit,
  onDelete,
  onClose,
}: DepositSheetProps) {
  const occurredOn = editing?.occurredOn ?? today;
  const month = monthOf(occurredOn);
  const original = editing?.amountMinor ?? 0;
  const [digits, setDigits] = useState(editing === null ? "" : String(editing.amountMinor));
  const initialRecurring = reserve.recurring !== null;
  const [recurring, setRecurring] = useState(initialRecurring);

  const amount = minorOf(digits);
  const valid = amount > 0 && amount <= MAX_MINOR;
  // Editar não pode contar o próprio guardado duas vezes: o saldo do mês já o descontou.
  const monthAvailable = monthBalance(state, month) + original;
  const over = amount > monthAvailable;
  const goal = reserve.kind === "emergency" ? emergencyTarget(state, reserve, today) : null;
  const after = reserveBalance(state, reserve.id) - original + amount;
  const dayOfRule = reserve.recurring?.day ?? Number(today.slice(8, 10));

  function add(minor: number) {
    setDigits(onlyDigits(String(Math.min(amount + minor, MAX_MINOR))));
  }

  return (
    <div class="flex flex-col">
      <SheetHeader
        title={editing === null ? "Guardar" : "Editar guardado"}
        onClose={onClose}
        actions={
          editing === null ? undefined : (
            <HoldToDelete label="Segure para excluir" onConfirm={onDelete} />
          )
        }
      />
      <SheetSubtitle reserve={reserve} prefix="Na" />

      <AmountField id="deposit-amount" digits={digits} onDigits={setDigits} />

      <div class="mt-3 flex flex-wrap gap-2">
        {[5_000, 10_000, 50_000].map((minor) => (
          <button
            key={minor}
            type="button"
            onClick={() => add(minor)}
            class="hf-press hf-num h-9 rounded-lg border border-divider px-3 text-[13px]"
          >
            +{minor / 100}
          </button>
        ))}
        <button
          type="button"
          disabled={monthAvailable <= 0}
          onClick={() => setDigits(onlyDigits(String(Math.min(monthAvailable, MAX_MINOR))))}
          class="hf-press flex h-9 items-center gap-1.5 rounded-lg border border-divider px-3
            text-[13px] disabled:pointer-events-none disabled:opacity-45"
        >
          <Icon name="sparkle" size={14} />
          Sobra do mês
        </button>
      </div>

      <h3 class={`${LABEL} mt-[18px]`}>Sai de</h3>
      <div class="mt-2 flex items-center gap-3 rounded-lg bg-bg px-3.5 py-3">
        <IconTile icon="wallet" color={null} size={32} iconSize={17} />
        <div class="min-w-0 flex-1">
          <div class="text-sm">Saldo de {monthName(month)}</div>
          <div class="hf-num text-xs text-fg/55">
            {formatBRL(monthAvailable)} → fica {formatBRL(monthAvailable - amount)}
          </div>
          {over && (
            <div class="mt-0.5 text-xs text-tag-amber">Maior que o saldo de {monthName(month)}</div>
          )}
        </div>
      </div>

      {editing === null && (
        <div class="mt-2 flex items-center gap-3 rounded-lg bg-bg px-3.5 py-0.5">
          <IconTile icon="repeat" color={null} size={32} iconSize={17} />
          <Toggle
            class="min-w-0 flex-1"
            checked={recurring}
            onChange={setRecurring}
            label="Guardar todo mês"
            hint={`Dia ${dayOfRule} · próximo em ${nextDepositLabel(state, reserve, today)}`}
          />
        </div>
      )}

      <p class="mt-3 flex gap-2 text-xs leading-normal text-fg/60 text-pretty">
        <Icon name="info" size={14} class="mt-px shrink-0 text-accent-300" />
        Não conta como despesa: o dinheiro só muda de lugar. Fica fora do gráfico de gastos.
      </p>

      <p class="hf-num mt-5 mb-2.5 text-center text-[13px] text-fg/65">
        Depois: {formatBRL(after)}
        {goal !== null && (
          <>
            {" · cobre "}
            <span class="font-medium text-accent-300">
              {formatMonths(monthsCovered(after, goal.costMinor))} meses
            </span>
          </>
        )}
      </p>
      <Button
        class="w-full"
        icon="check"
        iconSide="left"
        disabled={!valid}
        onClick={() =>
          onSubmit(
            { amountMinor: amount, description: editing?.description ?? null, occurredOn },
            // Só avisa a store quando o usuário mexeu: reenviar o estado inicial
            // reescreveria a regra (e o `since`) sem ninguém ter pedido.
            editing === null && recurring !== initialRecurring ? recurring : undefined,
          )
        }
      >
        Guardar {formatBRL(amount)}
      </Button>
    </div>
  );
}
