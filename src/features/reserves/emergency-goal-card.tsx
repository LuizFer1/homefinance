import type { ComponentChildren } from "preact";
import { EMERGENCY_MULTIPLES, type EmergencyMultiple } from "../../domain/model/reserve";
import { maskDigits, minorOf, onlyDigits } from "../../domain/money/mask";
import { FIELD_SHEET, LABEL } from "../ui/field";
import { Money, wholeBRL } from "../ui/money";
import { Segmented } from "../ui/segmented";

const OPTIONS = EMERGENCY_MULTIPLES.map((m) => ({ value: String(m), label: `${m} meses` }));

export interface EmergencyGoalCardProps {
  /** Custo essencial pelos lançamentos; null quando o histórico não dá para calcular. */
  costMinor: number | null;
  /** Dígitos do campo manual: só valem (e só aparecem) quando `costMinor` é null. */
  digits: string;
  onDigits: (digits: string) => void;
  costLabel: string;
  multiple: EmergencyMultiple;
  onMultiple: (multiple: EmergencyMultiple) => void;
  /** Linhas extras dentro do card (o depósito mensal, no formulário). */
  children?: ComponentChildren;
}

/**
 * Card da meta da emergência, comum ao estado vazio (2f) e ao formulário (2e).
 *
 * Com histórico o campo nem existe: assim nunca se grava um override que
 * contradiga os lançamentos. Sem histórico, o custo vem só do campo. Mora num
 * lugar só para as duas telas não divergirem sobre quando o campo aparece.
 */
export function EmergencyGoalCard({
  costMinor,
  digits,
  onDigits,
  costLabel,
  multiple,
  onMultiple,
  children,
}: EmergencyGoalCardProps) {
  const cost = costMinor ?? minorOf(digits);
  const ready = cost > 0;

  return (
    <section class="mt-[18px] rounded-lg bg-surface p-4">
      {costMinor === null ? (
        <>
          <label for="essential-cost" class={LABEL}>
            {costLabel}
          </label>
          <input
            id="essential-cost"
            inputMode="numeric"
            autocomplete="off"
            placeholder="0,00"
            value={maskDigits(digits)}
            onInput={(event) => onDigits(onlyDigits(event.currentTarget.value))}
            class={`${FIELD_SHEET} hf-num mt-2`}
          />
        </>
      ) : (
        <>
          <h3 class="hf-label">Pelos seus lançamentos</h3>
          <p class="mt-2.5 flex items-baseline justify-between text-sm">
            <span>Custo essencial</span>
            <span class="hf-num font-medium">{wholeBRL(costMinor)}/mês</span>
          </p>
        </>
      )}

      <Segmented
        name="emergency-multiple"
        legend="Meses de cobertura"
        onSurface
        variant="pill"
        class="mt-3"
        options={OPTIONS}
        value={String(multiple)}
        onChange={(value) => onMultiple(Number(value) as EmergencyMultiple)}
      />

      <div class="mt-3.5 flex items-baseline justify-between">
        <span class="text-sm text-fg/65">Meta sugerida</span>
        <Money minor={ready ? cost * multiple : 0} size={24} testId="suggested-target" />
      </div>
      {children}
    </section>
  );
}
