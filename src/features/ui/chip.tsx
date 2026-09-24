import type { ComponentChildren } from "preact";
import { Icon } from "../icons/icon";

/**
 * Chip selecionável (Data, Tipo de pagamento, Frequência): 40px, raio 8.
 * Normal com borda `divider`; marcado com borda de acento, fundo `accent-900` e
 * texto `accent-200`.
 */
export function chipClass(on: boolean): string {
  return (
    "hf-press inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border " +
    "px-3.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent " +
    (on
      ? "border-accent bg-accent-900 text-accent-200"
      : "border-divider text-fg/80 hover:bg-fg/[0.05]")
  );
}

export interface RadioChipProps {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  icon?: string;
  children: ComponentChildren;
}

/** Chip que é um rádio nativo — ver o porquê em `segmented.tsx`. */
export function RadioChip({ name, value, checked, onSelect, icon, children }: RadioChipProps) {
  return (
    <label class={chipClass(checked)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        class="sr-only"
      />
      {icon !== undefined && <Icon name={icon} size={16} />}
      <span class="truncate">{children}</span>
    </label>
  );
}
