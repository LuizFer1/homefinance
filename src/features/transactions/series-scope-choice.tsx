import type { SeriesEditField } from "../../domain/recurrence/edit-plan";
import { Button } from "../ui/button";
import { HINT } from "../ui/field";
import { SheetHeader } from "../ui/modal";

/** A quem a edição de uma ocorrência vale. */
export type EditScope = "one" | "following";

/** O que a escolha mostra: quais campos da série mudaram e quantas próximas seguem. */
export interface SeriesScopeSummary {
  fields: SeriesEditField[];
  /** Ocorrências já lançadas depois desta que também mudam. */
  following: number;
}

const FIELD_LABELS: Record<SeriesEditField, string> = {
  kind: "o tipo",
  description: "a descrição",
  categoryId: "a categoria",
  paymentMethodId: "a forma de pagamento",
  amountMinor: "o valor",
};

/** "a categoria e o valor"; "a descrição, a categoria e o valor". */
function listOf(fields: SeriesEditField[]): string {
  const labels = fields.map((field) => FIELD_LABELS[field]);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

export interface SeriesScopeChoiceProps {
  summary: SeriesScopeSummary;
  onChoose: (scope: EditScope) => void;
  /** Volta ao formulário com o rascunho intacto. */
  onBack: () => void;
}

/**
 * "Só este" ou "Este e os próximos", no lugar do formulário e dentro do mesmo
 * sheet: voltar devolve o rascunho como estava. É uma escolha, não um
 * formulário — sem etapas; cada botão nomeia o que grava.
 */
export function SeriesScopeChoice({ summary, onChoose, onBack }: SeriesScopeChoiceProps) {
  const n = summary.following;
  return (
    <div class="flex flex-col">
      <SheetHeader title="Mudar a série também?" onClose={onBack} />

      <p class="mt-5 text-[15px] text-fg/85">
        Você mudou {listOf(summary.fields)} de um lançamento que se repete.
      </p>
      <p class={HINT}>
        {n === 0
          ? "Os anteriores não mudam. Os próximos nascem com a mudança."
          : `Os anteriores não mudam. ${n === 1 ? "1 já lançado depois deste também muda" : `${n} já lançados depois deste também mudam`}, e os próximos nascem com a mudança.`}
      </p>

      <div class="sticky bottom-0 -mx-5 mt-6 flex flex-col gap-2.5 bg-surface px-5 pt-2">
        <Button icon="repeat" iconSide="left" onClick={() => onChoose("following")}>
          Este e os próximos
        </Button>
        <Button variant="secondary" onClick={() => onChoose("one")}>
          Só este
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
