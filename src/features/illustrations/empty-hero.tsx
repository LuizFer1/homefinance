import type { IllustrationKey } from "./assets";
import { ThemeIllustration } from "./theme-illustration";

export interface EmptyHeroProps {
  name: IllustrationKey;
  /** Título principal do estado vazio — a ilustração só existe junto dele. */
  title: string;
  /** Linha de apoio opcional, abaixo do título. */
  description?: string;
  class?: string;
}

/**
 * Estado vazio com ilustração + título, sem card.
 *
 * Sem borda/fundo: a arte não compete com a hierarquia dos cartões de dado.
 * `flex-1` + `justify-center` centralizam o bloco na altura que o pai ceder —
 * o pai (lista/dashboard) precisa ser flex column com altura mínima.
 */
export function EmptyHero({
  name,
  title,
  description,
  class: className = "",
}: EmptyHeroProps) {
  return (
    <div
      class={`flex flex-1 flex-col items-center justify-center px-2 text-center
        ${className}`.trim()}
    >
      <ThemeIllustration name={name} class="max-w-[13rem]" />
      <h2 class="hf-title mt-5 text-lg font-semibold text-base-content">{title}</h2>
      {description !== undefined && (
        <p class="mt-1.5 max-w-xs text-sm text-base-content/50">{description}</p>
      )}
    </div>
  );
}
