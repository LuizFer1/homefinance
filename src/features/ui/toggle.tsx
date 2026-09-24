import type { ComponentChildren } from "preact";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Rótulo principal da linha — é o nome acessível do checkbox. */
  label: string;
  /** Linha de apoio abaixo do rótulo. */
  hint?: ComponentChildren;
  class?: string;
}

/**
 * Interruptor 46×28 do handoff sobre um checkbox nativo.
 *
 * O checkbox continua lá (escondido, não removido): Espaço, foco e o anúncio de
 * "marcado" vêm do navegador. A linha inteira é o `<label>`, então o alvo de
 * toque é a largura do card, não os 46px do trilho.
 */
export function Toggle({ checked, onChange, label, hint, class: className = "" }: ToggleProps) {
  return (
    <label
      class={`flex min-h-11 cursor-pointer items-center justify-between gap-3 ${className}`.trim()}
    >
      <span class="min-w-0">
        <span class="block text-[15px] font-medium text-fg">{label}</span>
        {hint !== undefined && (
          <span class="mt-0.5 block text-[13px] leading-snug text-fg/55">{hint}</span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        class="peer sr-only"
      />
      <span
        aria-hidden="true"
        class={`relative h-7 w-[46px] shrink-0 rounded-[14px] transition-colors duration-150
          peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2
          peer-focus-visible:outline-accent ${
            checked
              ? "bg-accent-800 shadow-[inset_0_0_0_1px_var(--color-accent)]"
              : "bg-neutral-900 shadow-[inset_0_0_0_1px_var(--color-neutral-700)]"
          }`}
      >
        <span
          class={`absolute top-1 size-5 rounded-full transition-[left,background-color] duration-200
            ease-out-soft ${
              checked
                ? "left-[22px] bg-accent-200 shadow-[0_0_10px_var(--color-accent)]"
                : "left-1 bg-neutral-600"
            }`}
        />
      </span>
    </label>
  );
}
