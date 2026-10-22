import { cssVarForToken } from "../colors/color-token";

export interface CardMarkProps {
  /** Token da cor do cartão; desconhecido (ou de versão futura) cai no cinza neutro. */
  color: string;
  /** Lado da área reservada, em px: a mesma do tile que ele substitui. */
  size: number;
  class?: string;
}

/**
 * Identidade visual de um cartão de crédito: só a cor, sem tile de ícone.
 *
 * A área reservada tem o lado do `IconTile` que ele substitui, então o alinhamento
 * das listas (e as réguas recuadas até o texto) não muda. O nome acessível mora no
 * texto da linha, não aqui; por isso `aria-hidden`.
 */
export function CardMark({ color, size, class: className = "" }: CardMarkProps) {
  const dot = Math.max(10, Math.round(size * 0.42));
  return (
    <span
      aria-hidden="true"
      data-testid="card-mark"
      class={`grid shrink-0 place-items-center ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <span
        class="rounded-full"
        style={{ width: dot, height: dot, backgroundColor: cssVarForToken(color) }}
      />
    </span>
  );
}
