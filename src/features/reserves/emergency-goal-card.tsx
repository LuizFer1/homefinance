import { EMERGENCY_MULTIPLES, type EmergencyMultiple } from "../../domain/model/reserve";
import { maskDigits, minorOf, onlyDigits } from "../../domain/money/mask";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
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
  /**
   * Sem fundo nem recuo próprios: no sheet do formulário o próprio sheet já é a
   * superfície, e um card `surface` sobre `surface` só deslocaria o conteúdo.
   */
  flat?: boolean;
  /**
   * Custo que vale enquanto o campo está vazio (a edição com custo pelos
   * lançamentos e um override gravado): limpar o campo volta a esse custo, e a
   * meta tem de mostrá-lo em vez de cair para zero.
   */
  fallbackMinor?: number | null;
  /** Ajuda sob o campo de custo. */
  costHint?: string;
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
  flat = false,
  fallbackMinor = null,
  costHint,
}: EmergencyGoalCardProps) {
  const typed = minorOf(digits);
  const cost = costMinor ?? (typed > 0 ? typed : (fallbackMinor ?? 0));
  const ready = cost > 0;

  return (
    <section class={flat ? undefined : "mt-[18px] rounded-lg bg-surface p-4"}>
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
            aria-describedby={costHint === undefined ? undefined : "essential-cost-hint"}
            class={`${FIELD_SHEET} hf-num mt-2`}
          />
          {costHint !== undefined && (
            <p id="essential-cost-hint" class={HINT}>
              {costHint}
            </p>
          )}
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
    </section>
  );
}
