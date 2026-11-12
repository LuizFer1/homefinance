import { digitsOf, maskDigits } from "../../domain/money/mask";
import { LABEL } from "../ui/field";

/**
 * Campo de dinheiro dos sheets de bens e dívidas: só dígitos, lidos como centavos
 * (`digitsOf`/`maskDigits`). `<input>` de verdade, para o teclado numérico e o
 * leitor de tela.
 */
export function MoneyField({
  id,
  label,
  digits,
  onDigits,
  invalid = false,
}: {
  id: string;
  label: string;
  digits: string;
  onDigits: (digits: string) => void;
  invalid?: boolean;
}) {
  return (
    <div>
      <label for={id} class={LABEL}>
        {label}
      </label>
      <div
        class={`mt-2 flex h-12 items-center gap-2 rounded-lg border bg-bg px-3.5 text-base
          transition-[border-color] duration-150 focus-within:border-accent ${
            invalid ? "border-expense" : "border-divider"
          }`}
      >
        <span class="text-fg/60">R$</span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autocomplete="off"
          placeholder="0,00"
          aria-invalid={invalid ? "true" : undefined}
          value={maskDigits(digits)}
          onInput={(event) => onDigits(digitsOf(event.currentTarget))}
          class="hf-num min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg/40"
        />
      </div>
    </div>
  );
}
