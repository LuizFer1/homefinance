import { BRAND_ICONS } from "./icons";

export interface BrandMarkProps {
  /** Lado em CSS pixels (canvas do PNG é ~192×204; o browser escala). */
  size?: number;
  class?: string;
}

/**
 * Ícone de marca maskable 192 (par claro/escuro).
 *
 * Dois `<img>` e CSS de tema (`.hf-brand-mark-*`) — sem utilitário Tailwind
 * `block`/`hidden`, que vence o `@layer base` e empilha os dois assets.
 * Display só no CSS. Decorativo: o nome do app já está no texto ao lado.
 */
export function BrandMark({ size = 28, class: className = "" }: BrandMarkProps) {
  return (
    <span
      class={`hf-brand-mark inline-block shrink-0 overflow-hidden ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        src={BRAND_ICONS.light.maskable192}
        width={size}
        height={size}
        alt=""
        decoding="async"
        class="hf-brand-mark-light size-full object-contain"
      />
      <img
        src={BRAND_ICONS.dark.maskable192}
        width={size}
        height={size}
        alt=""
        decoding="async"
        class="hf-brand-mark-dark size-full object-contain"
      />
    </span>
  );
}
