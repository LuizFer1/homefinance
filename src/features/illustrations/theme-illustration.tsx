import { ILLUSTRATIONS, type IllustrationKey } from "./assets";

export interface ThemeIllustrationProps {
  name: IllustrationKey;
  /** Largura máxima do bloco (CSS). Altura acompanha a proporção do SVG. */
  class?: string;
}

/**
 * Ilustração com par claro/escuro, mesmo mecanismo do `BrandMark`.
 *
 * Decorativa: `aria-hidden` e `alt=""`. O conteúdo da tela já tem o texto;
 * a imagem não deve competir com leitores de tela.
 */
export function ThemeIllustration({ name, class: className = "" }: ThemeIllustrationProps) {
  const pair = ILLUSTRATIONS[name];
  // Os dois imgs entram no fluxo; o CSS (.hf-brand-mark-*) controla display.
  // Sem utilitário `block`/`hidden` do Tailwind — ele vence o @layer base.
  return (
    <div
      class={`hf-brand-mark mx-auto w-full max-w-[14rem] ${className}`.trim()}
      aria-hidden="true"
    >
      <img
        src={pair.light}
        alt=""
        decoding="async"
        class="hf-brand-mark-light h-auto w-full object-contain"
      />
      <img
        src={pair.dark}
        alt=""
        decoding="async"
        class="hf-brand-mark-dark h-auto w-full object-contain"
      />
    </div>
  );
}
