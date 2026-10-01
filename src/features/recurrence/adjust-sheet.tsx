import { useState } from "preact/hooks";
import { shiftMonth } from "../../domain/dates/calendar";
import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import { isAlive } from "../../domain/model/base";
import {
  applyPercent,
  formatPercent,
  parsePercent,
  percentChange,
} from "../../domain/money/adjust";
import { MAX_MINOR, maskDigits, minorOf, onlyDigits } from "../../domain/money/mask";
import { formatBRL } from "../../domain/money/money";
import { monthLabelShort } from "../../domain/projections/periods";
import {
  type AdjustmentInput,
  periodChoices,
  planAdjustment,
} from "../../domain/recurrence/adjust-plan";
import { adjustmentsOf, amountFor } from "../../domain/recurrence/adjustments";
import { Button } from "../ui/button";
import { RadioChip } from "../ui/chip";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { SheetHeader } from "../ui/modal";
import { Segmented } from "../ui/segmented";

export interface AdjustSheetProps {
  state: AppState;
  recurrenceId: Ulid;
  today: string;
  onConfirm: (input: AdjustmentInput) => void;
  onRemove: (adjustmentId: Ulid) => void;
  onClose: () => void;
}

type Mode = "amount" | "percent";

const MODES = [
  { value: "amount", label: "Valor" },
  { value: "percent", label: "Percentual" },
] as const;

/** 'YYYY-MM' vira "jan/2027". */
export function periodLabel(period: string): string {
  return `${monthLabelShort(period)}/${period.slice(0, 4)}`;
}

function updatesLabel(count: number): string {
  return count === 1 ? "Atualiza 1 lançamento já feito" : `Atualiza ${count} lançamentos já feitos`;
}

function keptLabel(count: number): string {
  return count === 1 ? "Mantém 1 editado à mão" : `Mantém ${count} editados à mão`;
}

/**
 * Reajuste de série: a partir de qual competência e para quanto.
 *
 * Valor e percentual são duas formas de digitar a mesma coisa; o que sai daqui
 * é sempre o valor em centavos. O resumo vem do mesmo `planAdjustment` que a
 * store usa para gravar, então o que a tela promete é o que acontece.
 */
export function AdjustSheet({
  state,
  recurrenceId,
  today,
  onConfirm,
  onRemove,
  onClose,
}: AdjustSheetProps) {
  const series = state.recurrences[recurrenceId];
  const choices = isAlive(series) ? periodChoices(state, series) : null;
  const [fromPeriod, setFromPeriod] = useState(choices?.initial ?? "");
  const [mode, setMode] = useState<Mode>("amount");
  // Dígitos, não texto formatado: a máscara decide como o número aparece.
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");

  if (!isAlive(series) || choices === null) {
    return (
      <div class="flex flex-col">
        <SheetHeader title="Reajustar série" onClose={onClose} />
        <p class={HINT}>Esta série não existe mais.</p>
      </div>
    );
  }

  const adjustments = adjustmentsOf(state, series.id);
  const currentMinor = amountFor(series, adjustments, today.slice(0, 7));
  // A base é o valor vigente logo antes da competência escolhida: o segundo
  // aumento é calculado sobre o primeiro, não sobre o valor original.
  const baseMinor = amountFor(series, adjustments, shiftMonth(fromPeriod, -1));
  const parsedPercent = parsePercent(percent);
  const nextMinor =
    mode === "amount"
      ? minorOf(amount)
      : parsedPercent === null
        ? 0
        : applyPercent(baseMinor, parsedPercent);
  // O mesmo teto do campo de valor: o percentual não pode furar o que a máscara recusa.
  const valid = nextMinor > 0 && nextMinor <= MAX_MINOR && nextMinor !== baseMinor;
  const plan = valid
    ? planAdjustment(state, { recurrenceId: series.id, fromPeriod, amountMinor: nextMinor })
    : null;

  return (
    <div class="flex flex-col">
      <SheetHeader title="Reajustar série" onClose={onClose} />

      <p class="mt-4 text-sm text-fg/70">
        {series.description} · hoje <span class="hf-num text-fg">{formatBRL(currentMinor)}</span>
      </p>

      {/* Fieldset tem min-width: min-content por padrão; sem `min-w-0` a fileira de
          chips alarga o sheet em vez de rolar dentro dele. */}
      <fieldset class="mt-5 min-w-0">
        <legend class={LABEL}>A partir de</legend>
        {/*
          `relative`: o rádio de cada chip é `sr-only` (absoluto). Sem um ancestral
          posicionado aqui, os rádios dos chips fora da tela contam na largura do
          <dialog> e o sheet inteiro ganha rolagem horizontal.
        */}
        <div class="relative -mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {choices.periods.map((period) => (
            <RadioChip
              key={period}
              name="fromPeriod"
              value={period}
              checked={period === fromPeriod}
              onSelect={() => setFromPeriod(period)}
            >
              {periodLabel(period)}
            </RadioChip>
          ))}
        </div>
      </fieldset>

      <Segmented
        name="adjust-mode"
        legend="Como reajustar"
        variant="pill"
        options={MODES}
        value={mode}
        onChange={setMode}
        class="mt-5"
      />

      {mode === "amount" ? (
        <div class="mt-4">
          <label class={LABEL} for="adjust-amount">
            Valor novo
          </label>
          <input
            id="adjust-amount"
            type="text"
            inputMode="numeric"
            autocomplete="off"
            placeholder="0,00"
            value={maskDigits(amount)}
            onInput={(event) => setAmount(onlyDigits(event.currentTarget.value))}
            class={`${FIELD_SHEET} hf-num mt-2`}
          />
        </div>
      ) : (
        <div class="mt-4">
          <label class={LABEL} for="adjust-percent">
            Percentual (%)
          </label>
          {/*
            Teclado decimal: o do iOS não tem sinal de menos, então redução se
            faz pelo valor novo. O parse aceita o sinal para quem tem teclado.
          */}
          <input
            id="adjust-percent"
            type="text"
            inputMode="decimal"
            autocomplete="off"
            placeholder="12,5"
            value={percent}
            onInput={(event) => setPercent(event.currentTarget.value)}
            class={`${FIELD_SHEET} hf-num mt-2`}
          />
          <p class={HINT}>Para reduzir, informe o valor novo.</p>
        </div>
      )}

      <div class="mt-5 rounded-lg bg-bg px-4 py-3 text-sm" aria-live="polite">
        {plan !== null ? (
          <>
            <p>
              <span class="hf-num">{formatBRL(baseMinor)}</span>
              {" → "}
              <span class="hf-num font-medium">{formatBRL(nextMinor)}</span>{" "}
              <span class="text-fg/60">({formatPercent(percentChange(baseMinor, nextMinor))})</span>
            </p>
            <p class="mt-1 text-fg/60">a partir de {periodLabel(fromPeriod)}</p>
            {plan.updates.length > 0 && <p class="mt-2">{updatesLabel(plan.updates.length)}</p>}
            {plan.kept.length > 0 && <p class="mt-1 text-fg/60">{keptLabel(plan.kept.length)}</p>}
          </>
        ) : (
          <p class="text-fg/60">
            {nextMinor > MAX_MINOR
              ? "Valor acima do permitido."
              : nextMinor > 0 && nextMinor === baseMinor
                ? "O valor novo é igual ao atual."
                : "Informe o valor novo ou o percentual."}
          </p>
        )}
      </div>

      <Button
        class="mt-5 w-full"
        icon="check"
        disabled={plan === null}
        onClick={() => onConfirm({ recurrenceId: series.id, fromPeriod, amountMinor: nextMinor })}
      >
        Confirmar reajuste
      </Button>

      {adjustments.length > 0 && (
        <section class="mt-6">
          <h3 class={LABEL}>Reajustes</h3>
          <ul class="mt-2 divide-y divide-divider">
            {[...adjustments].reverse().map((row) => (
              <li key={row.id} class="flex items-center gap-3 py-2.5 text-sm">
                <span class="min-w-0 flex-1">
                  desde {periodLabel(row.fromPeriod)} ·{" "}
                  <span class="hf-num">{formatBRL(row.amountMinor)}</span>
                </span>
                <HoldToDelete
                  label={`Excluir reajuste de ${periodLabel(row.fromPeriod)}`}
                  onConfirm={() => onRemove(row.id)}
                />
              </li>
            ))}
          </ul>
          <p class={HINT}>Excluir um reajuste não muda lançamentos já feitos.</p>
        </section>
      )}
    </div>
  );
}
