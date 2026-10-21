import type { BudgetLevel } from "../../domain/budgets/status";

export interface BudgetBarProps {
  /** `gasto / meta`, sem teto: acima de 1 é meta estourada. */
  ratio: number;
  level: BudgetLevel;
  /** Nome acessível: "Meta de Alimentação". */
  label: string;
}

const FILL: Record<BudgetLevel, string> = {
  ok: "bg-accent",
  warning: "bg-tag-amber",
  over: "bg-expense",
};

/**
 * Barra de uso de uma meta.
 *
 * Passar de 100% é informação, não erro: a barra enche e muda para a cor de
 * despesa, e o texto ao lado diz quanto passou — nada aqui bloqueia o gasto. O
 * `aria-valuetext` carrega só a porcentagem, nunca o valor em reais, para o
 * leitor de tela não ler o que "Ocultar valores" esconde.
 */
export function BudgetBar({ ratio, level, label }: BudgetBarProps) {
  // `floor`, e não `round`: 99,6% não pode ser lido como "100%" enquanto a meta
  // ainda não foi atingida.
  const percent = Math.floor(ratio * 100);
  const text = level === "over" ? `Meta estourada: ${percent}% usado` : `${percent}% da meta usada`;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, percent)}
      aria-valuetext={text}
      class="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800"
    >
      <div
        class={`h-full rounded-full transition-[width] duration-300 ${FILL[level]}`}
        style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
      />
    </div>
  );
}
