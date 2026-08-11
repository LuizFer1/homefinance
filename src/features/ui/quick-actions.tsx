import { Icon } from "../icons/icon";

export interface QuickAction {
  id: string;
  label: string;
  /** Chave do `ICON_SET`. Só chaves já no bundle — ícone novo custa gzip. */
  icon: string;
  /**
   * Classes de cor da ação primária.
   *
   * Vermelho em despesa e verde em receita é a cor carregando significado, que é
   * a única razão pela qual ela entra neste app — o `app.css` registra
   * exatamente receita/despesa como o caso legítimo. Os tokens `error` e
   * `success` já têm par calibrado para os dois temas.
   */
  tone?: string;
  onSelect: () => void;
}

export interface QuickActionsProps {
  /** Despesa e receita — o que o usuário faz todo dia nesta tela. */
  actions: QuickAction[];
}

/**
 * Ações diárias da home: lançar despesa e receita.
 *
 * Cadastro de categoria e forma de pagamento mora em Ajustes. Estar aqui
 * competia com o fluxo diário e pedia peso visual de "evento" para uma ação
 * ocasional — criação fica na gestão, não na fila de lançamento.
 */
const PRIMARY =
  "hf-press rounded-box flex flex-1 items-center justify-center gap-2.5 border py-4 " +
  "font-semibold transition-colors duration-150 " +
  "focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:outline-none";

/** Fundo tingido e não preenchido: a cor marca o sentido sem gritar na tela. */
const NEUTRAL_TONE = "border-base-content/10 bg-base-100 hover:border-base-content/25";

export function QuickActions({ actions }: QuickActionsProps) {
  return (
    <nav aria-label="Ações rápidas" class="mt-4">
      <div class="flex gap-3">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onSelect}
            class={`${PRIMARY} ${action.tone ?? NEUTRAL_TONE}`}
          >
            <Icon name={action.icon} size={22} />
            {action.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
