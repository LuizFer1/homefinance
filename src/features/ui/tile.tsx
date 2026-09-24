import { tileStyle } from "../colors/color-token";
import { Icon } from "../icons/icon";

export interface IconTileProps {
  icon: string;
  /** Token da paleta. `null` = tile neutro (texto a 7%), dos Ajustes. */
  color: string | null;
  /** Lado do tile em px (38 na linha de lançamento, 36 no cadastro, 28–32 no dashboard). */
  size: number;
  iconSize?: number;
  class?: string;
}

/**
 * Quadrado de ícone com raio 8: fundo a 18% da cor, ícone na cor cheia.
 *
 * Quadrado e não disco, como no app antigo: o Nocturne usa o mesmo raio 8 de
 * cards e botões, e um disco no meio de tudo reto lia como outro sistema.
 */
export function IconTile({ icon, color, size, iconSize, class: className = "" }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      class={`grid shrink-0 place-items-center rounded-lg ${
        color === null ? "bg-fg/[0.07] text-fg/85" : ""
      } ${className}`.trim()}
      style={{ width: size, height: size, ...(color === null ? {} : tileStyle(color)) }}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.5)} />
    </span>
  );
}
