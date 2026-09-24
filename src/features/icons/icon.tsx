import { FALLBACK_ICON, ICON_SET } from "./icon-set";
import { PHOSPHOR, type PhosphorName } from "./phosphor-paths";

export interface IconProps {
  /**
   * Chave persistida no log (ver `icon-set.ts`) ou nome Phosphor de interface.
   * String livre de propósito: vem de dado sincronizado.
   */
  name: string;
  size?: number;
  /** `fill` só onde o handoff pede: aba ativa e "Escuro" selecionado. */
  weight?: "regular" | "fill";
  /** Sem rótulo o ícone é decorativo e sai da árvore de acessibilidade. */
  label?: string;
  class?: string;
}

/**
 * Resolve primeiro a chave de domínio, depois o nome de interface.
 *
 * `Object.hasOwn` e não `in`: um `name="constructor"` vindo do log acharia uma
 * função no protótipo e o render explodiria.
 */
function resolve(name: string): { glyph: PhosphorName; known: boolean } {
  if (Object.hasOwn(ICON_SET, name)) {
    return { glyph: ICON_SET[name as keyof typeof ICON_SET], known: true };
  }
  if (Object.hasOwn(PHOSPHOR, name)) return { glyph: name as PhosphorName, known: true };
  return { glyph: FALLBACK_ICON, known: false };
}

export function Icon({ name, size = 18, weight = "regular", label, class: className }: IconProps) {
  const { glyph, known } = resolve(name);
  const filled = `${glyph}-fill`;
  const d =
    weight === "fill" && Object.hasOwn(PHOSPHOR, filled)
      ? PHOSPHOR[filled as PhosphorName]
      : PHOSPHOR[glyph];

  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      class={className === undefined ? "shrink-0" : `shrink-0 ${className}`}
      aria-hidden={label === undefined ? "true" : undefined}
      aria-label={label}
      role={label === undefined ? undefined : "img"}
      data-testid={known ? `icon-${name}` : "icon-fallback"}
    >
      <path d={d} />
    </svg>
  );
}
