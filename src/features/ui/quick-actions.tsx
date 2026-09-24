import { Icon } from "../icons/icon";

export interface QuickActionsProps {
  onExpense: () => void;
  onIncome: () => void;
}

/**
 * Ações diárias da home: lançar despesa e receita.
 *
 * Cor com significado, que é a única razão pela qual cor entra neste app:
 * borda na cor semântica a 55% e fundo a 9%. As setas dizem a direção do
 * dinheiro — sai (↗) e entra (↙) — antes de a palavra ser lida.
 *
 * Cadastro de categoria e forma de pagamento mora em Ajustes: criação é gestão,
 * não fila de lançamento.
 */
export function QuickActions({ onExpense, onIncome }: QuickActionsProps) {
  return (
    <nav aria-label="Ações rápidas" class="mt-5 grid grid-cols-2 gap-2.5">
      <button
        type="button"
        onClick={onExpense}
        class="hf-press flex h-[52px] items-center justify-center gap-2 rounded-lg border
          border-expense/55 bg-expense/[0.09] text-[15px] font-medium text-expense-fg
          hover:bg-expense/[0.16]"
      >
        <Icon name="arrow-up-right" size={18} />
        Despesa
      </button>
      <button
        type="button"
        onClick={onIncome}
        class="hf-press flex h-[52px] items-center justify-center gap-2 rounded-lg border
          border-income/55 bg-income/[0.09] text-[15px] font-medium text-income-fg
          hover:bg-income/[0.16]"
      >
        <Icon name="arrow-down-left" size={18} />
        Receita
      </button>
    </nav>
  );
}
