export interface BrandMarkProps {
  /** Lado do quadro em CSS pixels (44 no onboarding do handoff). */
  size?: number;
  class?: string;
}

/**
 * Marca do app: a casa com a cédula dentro, redesenhada como vetor.
 *
 * Os PNGs de marca são traço preto, e traço preto some no fundo do Nocturne —
 * exatamente o defeito que o handoff apontou. Em `currentColor` o mesmo símbolo
 * serve aos dois temas sem um segundo asset, e o quadro com contorno de acento e
 * brilho é o do handoff. Os PNGs continuam existindo para favicon e manifest,
 * onde o fundo é opaco.
 *
 * Decorativo: o nome do app já está no texto ao lado.
 */
export function BrandMark({ size = 44, class: className = "" }: BrandMarkProps) {
  const glyph = Math.round(size * 0.55);

  return (
    <span
      aria-hidden="true"
      data-testid="brand-mark"
      class={`hf-glow inline-grid shrink-0 place-items-center rounded-xl border border-accent
        text-accent-300 ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={glyph}
        height={glyph}
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linejoin="round"
        stroke-linecap="round"
      >
        <path d="M3.5 10.2 12 2.8l8.5 7.4V21h-17Z" />
        <path
          d="M6.8 11.6c1.9-.9 3.4.9 5.2 0s3.3-.9 5.2 0v5.2c-1.9-.9-3.4.9-5.2 0s-3.3-.9-5.2 0Z"
          stroke-width="1.4"
        />
        <circle cx="12" cy="14.2" r="1.2" stroke-width="1.3" />
        <path d="M8.9 13v2.4M15.1 13v2.4" stroke-width="1.3" />
      </svg>
    </span>
  );
}
