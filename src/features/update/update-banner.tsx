import { Icon } from "../icons/icon";

/**
 * Aviso discreto, não modal: a versão nova pode esperar a pessoa terminar o
 * que está fazendo. Atualizar recarrega a tela, então a decisão é dela.
 */
export function UpdateBanner({ onApply }: { onApply: () => void }) {
  return (
    <div
      role="status"
      class="mb-4 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm"
    >
      <Icon name="arrows-clockwise" size={18} />
      <p class="min-w-0 flex-1 text-fg/85">Nova versão disponível.</p>
      <button
        type="button"
        onClick={onApply}
        class="hf-press shrink-0 rounded-md px-2 py-1 font-medium text-accent-300 hover:bg-accent/15"
      >
        Atualizar
      </button>
    </div>
  );
}
