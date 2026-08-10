import { Icon } from "../icons/icon";

export interface QuickAction {
  id: string;
  label: string;
  /** Chave do `ICON_SET`. Só chaves já no bundle — ícone novo custa gzip. */
  icon: string;
  onSelect: () => void;
}

export interface QuickActionsProps {
  /** Ação principal da tela. Recebe peso visual maior. */
  primary: QuickAction[];
  /** Ações de apoio, menores. */
  secondary: QuickAction[];
}

/**
 * Ações rápidas em dois níveis.
 *
 * Lançar despesa e receita é o que o usuário faz todo dia; criar categoria é o
 * que ele faz de vez em quando. Dar o mesmo peso às quatro faria a ação diária
 * competir com a eventual, e é por isso que os primários levam ícone maior e
 * fundo preenchido enquanto os secundários ficam em contorno.
 */
const PRIMARY =
  "hf-press rounded-box flex flex-1 items-center justify-center gap-2.5 " +
  "border border-base-content/10 bg-base-100 py-4 text-sm font-semibold " +
  "transition-colors duration-150 hover:border-base-content/25 " +
  "focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:outline-none";

const SECONDARY =
  "hf-press rounded-field flex flex-1 items-center justify-center gap-1.5 " +
  "border border-dashed border-base-content/20 py-2.5 text-xs font-medium " +
  "text-base-content/60 transition-colors duration-150 " +
  "hover:border-base-content/35 hover:text-base-content " +
  "focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:outline-none";

export function QuickActions({ primary, secondary }: QuickActionsProps) {
  return (
    <nav aria-label="Ações rápidas" class="mt-4">
      <div class="flex gap-3">
        {primary.map((action) => (
          <button key={action.id} type="button" onClick={action.onSelect} class={PRIMARY}>
            <Icon name={action.icon} size={22} />
            {action.label}
          </button>
        ))}
      </div>

      <div class="mt-2.5 flex gap-2.5">
        {secondary.map((action) => (
          <button key={action.id} type="button" onClick={action.onSelect} class={SECONDARY}>
            <Icon name={action.icon} size={15} />
            {action.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
