import { shiftMonth } from "../../domain/dates/calendar";
import { monthLabelShort } from "../../domain/projections/periods";
import { Icon } from "../icons/icon";

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}

/** "Set 2026" do seletor. */
function pickerLabel(month: string): string {
  return `${capitalize(monthLabelShort(month))} ${month.slice(0, 4)}`;
}

export function MonthPicker({
  month,
  current,
  onChange,
}: {
  month: string;
  current: string;
  onChange: (month: string) => void;
}) {
  const atPresent = month >= current;

  return (
    <div class="flex h-9 shrink-0 items-center rounded-lg border border-divider">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonth(month, -1))}
        class="hf-press grid h-full w-8 place-items-center text-fg/75"
      >
        <Icon name="caret-left" size={16} />
      </button>
      <span aria-live="polite" class="hf-num px-0.5 text-[13px] font-medium">
        {pickerLabel(month)}
      </span>
      {/* O futuro não tem lançamento: a seta fica a 30% e não anda. */}
      <button
        type="button"
        aria-label="Próximo mês"
        disabled={atPresent}
        onClick={() => onChange(shiftMonth(month, 1))}
        class="hf-press grid h-full w-8 place-items-center text-fg/75 disabled:opacity-30"
      >
        <Icon name="caret-right" size={16} />
      </button>
    </div>
  );
}
