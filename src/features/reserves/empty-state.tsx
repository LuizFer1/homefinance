import { useState } from "preact/hooks";
import { EMERGENCY_MULTIPLES, type EmergencyMultiple } from "../../domain/model/reserve";
import { maskDigits, minorOf, onlyDigits } from "../../domain/money/mask";
import { Button } from "../ui/button";
import { FIELD_SHEET, LABEL } from "../ui/field";
import { Money, wholeBRL } from "../ui/money";
import { Segmented } from "../ui/segmented";
import { MonthsMeter } from "./months-meter";

export interface EmptyStateProps {
  /** Custo essencial pelos lançamentos; null quando o histórico não dá para calcular. */
  costMinor: number | null;
  onCreateEmergency: (multiple: EmergencyMultiple, essentialOverrideMinor: number | null) => void;
  onCreateGoal: () => void;
}

const OPTIONS = EMERGENCY_MULTIPLES.map((m) => ({ value: String(m), label: `${m} meses` }));

/** Estado vazio (2f): convida a criar a emergência antes de qualquer caixinha. */
export function EmptyState({ costMinor, onCreateEmergency, onCreateGoal }: EmptyStateProps) {
  const [multiple, setMultiple] = useState<EmergencyMultiple>(6);
  const [digits, setDigits] = useState("");
  // Com histórico o campo nem existe: assim nunca se grava um override que
  // contradiga os lançamentos. Sem histórico, o custo vem só do campo.
  const cost = costMinor ?? minorOf(digits);
  const ready = cost > 0;

  return (
    <div class="mt-10">
      <MonthsMeter months={0} height={14} dashed />
      <div class="mt-2 flex justify-between text-[11px] text-fg/45">
        <span>0 meses</span>
        <span>6 meses</span>
      </div>

      <h2 class="mt-7 text-xl font-medium">Comece pela reserva de emergência</h2>
      <p class="mt-1.5 text-sm leading-normal text-fg/[0.62] text-pretty">
        É o dinheiro que segura um imprevisto — conserto, saúde, um mês sem renda. O comum é guardar
        de 3 a 6 meses do que você gasta com o essencial.
      </p>

      <section class="mt-[18px] rounded-lg bg-surface p-4">
        {costMinor === null ? (
          <>
            <label for="essential-cost" class={LABEL}>
              Quanto você gasta com o essencial por mês?
            </label>
            <input
              id="essential-cost"
              inputMode="numeric"
              autocomplete="off"
              placeholder="0,00"
              value={maskDigits(digits)}
              onInput={(event) => setDigits(onlyDigits(event.currentTarget.value))}
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
          onChange={(value) => setMultiple(Number(value) as EmergencyMultiple)}
        />

        <div class="mt-3.5 flex items-baseline justify-between">
          <span class="text-sm text-fg/65">Meta sugerida</span>
          <Money minor={ready ? cost * multiple : 0} size={24} testId="suggested-target" />
        </div>
      </section>

      <Button
        icon="lifebuoy"
        iconSide="left"
        class="mt-[18px] w-full"
        disabled={!ready}
        onClick={() => onCreateEmergency(multiple, costMinor === null ? cost : null)}
      >
        Criar reserva de emergência
      </Button>
      <button
        type="button"
        onClick={onCreateGoal}
        class="hf-press mt-1.5 h-11 w-full text-sm font-medium text-accent-300"
      >
        Criar só uma caixinha
      </button>
    </div>
  );
}
