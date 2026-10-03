import { Icon } from "../icons/icon";

export interface AccentIconBoxProps {
  size: 32 | 36 | 40;
  iconSize?: number;
  icon?: string;
}

/**
 * Caixa de ícone da emergência: contorno de acento com brilho, e não o tile
 * tingido das caixinhas. É o que distingue a reserva "de verdade" da lista de
 * metas à primeira vista; por isso mora num lugar só (2a, 2b, 2e).
 */
export function AccentIconBox({ size, iconSize, icon = "lifebuoy" }: AccentIconBoxProps) {
  return (
    <span
      aria-hidden="true"
      class="grid shrink-0 place-items-center rounded-lg border border-accent text-accent-300 shadow-[0_0_16px_-4px_color-mix(in_srgb,var(--color-accent)_60%,transparent)]"
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={iconSize ?? (size === 32 ? 16 : size === 36 ? 18 : 20)} />
    </span>
  );
}
