import { useState } from "preact/hooks";
import type { EmergencyMultiple } from "../../domain/model/reserve";
import { minorOf } from "../../domain/money/mask";
import { Button } from "../ui/button";
import { EmergencyGoalCard } from "./emergency-goal-card";
import { MonthsMeter } from "./months-meter";

export interface EmptyStateProps {
  /** Custo essencial pelos lançamentos; null quando o histórico não dá para calcular. */
  costMinor: number | null;
  onCreateEmergency: (multiple: EmergencyMultiple, essentialOverrideMinor: number | null) => void;
  onCreateGoal: () => void;
}

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

      <EmergencyGoalCard
        costMinor={costMinor}
        digits={digits}
        onDigits={setDigits}
        costLabel="Quanto você gasta com o essencial por mês?"
        multiple={multiple}
        onMultiple={setMultiple}
      />

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
