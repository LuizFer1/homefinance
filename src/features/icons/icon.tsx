import { FALLBACK_ICON, ICON_SET } from "./icon-set";

export interface IconProps {
  /** Chave persistida no log. String livre de propósito — ver `icon-set.ts`. */
  name: string;
  size?: number;
  /** Sem rótulo o ícone é decorativo e sai da árvore de acessibilidade. */
  label?: string;
  class?: string;
}

export function Icon({ name, size = 18, label, class: className }: IconProps) {
  const known = Object.hasOwn(ICON_SET, name);
  const Glyph = known ? ICON_SET[name as keyof typeof ICON_SET] : FALLBACK_ICON;

  return (
    <Glyph
      size={size}
      class={className}
      aria-hidden={label === undefined ? "true" : undefined}
      aria-label={label}
      role={label === undefined ? undefined : "img"}
      data-testid={known ? `icon-${name}` : "icon-fallback"}
    />
  );
}
