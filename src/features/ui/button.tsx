import type { ComponentChildren, JSX } from "preact";
import { Icon } from "../icons/icon";

/**
 * Os dois botões do Nocturne, como classes: `<label>` de arquivo e botões
 * `submit` também precisam da mesma cara, e um componente só não cobre os três.
 *
 * Primário é **contorno** com brilho, nunca preenchido: o acento aparece como
 * linha e luz, não como bloco de cor. Hover e pressionado sobem a tinta do
 * fundo (+12% / +22%) em vez de escurecer.
 */
export const PRIMARY =
  "hf-press hf-glow inline-flex h-[52px] min-w-0 items-center justify-center gap-2 rounded-lg " +
  "border border-accent bg-accent/10 px-5 text-[15px] font-medium text-accent-300 " +
  "hover:bg-accent/[0.22] active:bg-accent/[0.32] disabled:pointer-events-none disabled:opacity-45";

export const SECONDARY =
  "hf-press inline-flex h-[52px] min-w-0 items-center justify-center gap-2 rounded-lg " +
  "border border-divider px-[22px] text-[15px] font-medium text-fg " +
  "hover:bg-fg/[0.07] active:bg-fg/[0.14] disabled:pointer-events-none disabled:opacity-45";

type NativeButton = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "icon" | "class">;

export interface ButtonProps extends NativeButton {
  variant?: "primary" | "secondary";
  /** Nome Phosphor. `arrow-right` avança; `check` conclui. */
  icon?: string;
  iconSide?: "left" | "right";
  class?: string;
  children: ComponentChildren;
}

export function Button({
  variant = "primary",
  icon,
  iconSide = "right",
  class: className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const glyph = icon === undefined ? null : <Icon name={icon} size={18} />;

  return (
    <button
      type={type}
      class={`${variant === "primary" ? PRIMARY : SECONDARY} ${className}`.trim()}
      {...rest}
    >
      {iconSide === "left" && glyph}
      <span class="truncate">{children}</span>
      {iconSide === "right" && glyph}
    </button>
  );
}
