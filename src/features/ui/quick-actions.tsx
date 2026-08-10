import { Icon } from "../icons/icon";

export interface QuickAction {
  id: string;
  label: string;
  /** Chave do `ICON_SET`. Só chaves já no bundle — ícone novo custa gzip. */
  icon: string;
  onSelect: () => void;
}

export interface QuickActionsProps {
  actions: QuickAction[];
}

/**
 * Fila de ações em bloco, sob o saldo.
 *
 * Botão quadrado com borda e superfície translúcida, e não pílula preenchida: a
 * borda separa o bloco do cartão atrás dele sem gastar cor, que aqui não
 * carregaria significado nenhum — as quatro ações têm o mesmo peso.
 */
const TILE =
  "hf-press rounded-box flex flex-1 flex-col items-center justify-center gap-1.5 " +
  "border border-base-content/10 bg-base-100/60 py-3 text-[0.6875rem] font-medium " +
  "text-base-content/70 transition-colors duration-150 " +
  "hover:border-base-content/20 hover:text-base-content " +
  "focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:outline-none";

export function QuickActions({ actions }: QuickActionsProps) {
  return (
    <nav aria-label="Ações rápidas" class="mt-4 flex gap-2">
      {actions.map((action) => (
        <button key={action.id} type="button" onClick={action.onSelect} class={TILE}>
          <Icon name={action.icon} size={20} />
          {action.label}
        </button>
      ))}
    </nav>
  );
}
