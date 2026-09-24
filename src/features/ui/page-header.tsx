import type { ComponentChildren } from "preact";
import { Icon } from "../icons/icon";

export interface PageHeaderProps {
  title: string;
  /** Sub-telas de Ajustes: "‹ Ajustes" acima do título. */
  onBack?: () => void;
  /** Ação à direita do título ("+ Nova", seletor de mês). */
  action?: ComponentChildren;
}

/** Título de página 28px/500 do handoff, com o voltar opcional em cima. */
export function PageHeader({ title, onBack, action }: PageHeaderProps) {
  return (
    <div>
      {onBack !== undefined && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar para configurações"
          class="hf-press -ml-1 flex h-9 items-center gap-0.5 pr-2 text-sm text-accent-300"
        >
          <Icon name="caret-left" size={16} />
          Ajustes
        </button>
      )}
      <div class={`flex items-center justify-between gap-3 ${onBack !== undefined ? "mt-1" : ""}`}>
        <h1 class="min-w-0 truncate text-[28px] leading-tight font-medium tracking-[-0.02em]">
          {title}
        </h1>
        {action}
      </div>
    </div>
  );
}
