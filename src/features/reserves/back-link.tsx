import { Icon } from "../icons/icon";

/** "‹ Reservas": volta para a aba, igual no detalhe (2b) e no formulário (2e). */
export function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      class="hf-press -ml-1.5 flex h-9 items-center gap-1 pr-2 text-sm text-fg/65"
    >
      <Icon name="caret-left" size={18} />
      Reservas
    </button>
  );
}
