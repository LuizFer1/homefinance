import type { ColorToken } from "../../domain/events/reference";
import { COLOR_NAMES, COLOR_TOKENS, cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";

export interface SwatchesProps {
  name: string;
  legend: string;
  value: string;
  onChange: (token: ColorToken) => void;
  /**
   * Cor do fundo onde a grade mora. O anel de seleção é `0 0 0 3px <fundo>,
   * 0 0 0 5px <cor>`: sem o fundo certo, o vão entre a bola e o anel some.
   */
  surface?: "bg" | "surface";
  class?: string;
}

/**
 * Grade de 12 cores, 44px, seis por linha.
 *
 * O nome acessível é o nome da cor em português ("Céu"), não o token gravado:
 * quem ouve a tela não sabe o que é "sky" e não deveria precisar saber.
 */
export function Swatches({
  name,
  legend,
  value,
  onChange,
  surface = "bg",
  class: className = "",
}: SwatchesProps) {
  const gap = `var(--color-${surface})`;

  return (
    <fieldset class={className}>
      <legend class="sr-only">{legend}</legend>
      <div class="grid grid-cols-[repeat(6,2.75rem)] justify-between gap-y-4">
        {COLOR_TOKENS.map((token) => {
          const on = token === value;
          const color = cssVarForToken(token);

          return (
            <label
              key={token}
              class="hf-press grid size-11 cursor-pointer place-items-center rounded-full
                has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4
                has-[:focus-visible]:outline-accent"
              style={{
                backgroundColor: color,
                boxShadow: on ? `0 0 0 3px ${gap}, 0 0 0 5px ${color}` : undefined,
              }}
            >
              <input
                type="radio"
                name={name}
                value={token}
                aria-label={COLOR_NAMES[token]}
                checked={on}
                onChange={() => onChange(token)}
                class="sr-only"
              />
              {on && <Icon name="check" size={18} class="text-bg" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
