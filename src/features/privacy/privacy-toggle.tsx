import { Icon } from "../icons/icon";
import { hideValues, setHideValues } from "./privacy";

/**
 * Olho no topo de toda tela. `aria-pressed` marca o estado, e o rótulo fixo
 * ("Ocultar valores") descreve a ação do botão, não o estado: o leitor de tela
 * anuncia "pressionado" sozinho.
 */
export function PrivacyToggle() {
  const hidden = hideValues.value;

  return (
    <div class="flex justify-end">
      <button
        type="button"
        aria-pressed={hidden}
        aria-label="Ocultar valores"
        onClick={() => setHideValues(!hidden)}
        class="hf-press -mr-2 grid size-9 place-items-center rounded-full text-fg/65 hover:bg-fg/[0.06]"
      >
        <Icon name={hidden ? "eye-slash" : "eye"} size={20} />
      </button>
    </div>
  );
}
