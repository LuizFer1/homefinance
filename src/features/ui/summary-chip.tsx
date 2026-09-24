import type { ComponentChildren } from "preact";

export interface SummaryChipProps {
  /** Ponto ou tile à esquerda. */
  leading?: ComponentChildren;
  title: string;
  /** "· Hoje · não repete" — atenuado a 55%. */
  context?: string;
  /** Valor à direita. */
  trailing?: ComponentChildren;
}

/**
 * Faixa-resumo dos passos 2 em diante: mostra o que já foi preenchido.
 *
 * Existe porque os passos seguintes decidem coisas que só fazem sentido com o
 * primeiro à vista — escolher a categoria de "Mercado, −R$ 254,30" é outra
 * pergunta que escolher a categoria de um lançamento sem rosto.
 */
export function SummaryChip({ leading, title, context, trailing }: SummaryChipProps) {
  return (
    <div class="flex min-h-11 items-center gap-2.5 rounded-lg bg-bg px-3 py-2.5 text-sm">
      {leading}
      <span class="min-w-0 flex-1 truncate">
        <span class="font-medium">{title}</span>
        {context !== undefined && context !== "" && <span class="text-fg/55"> · {context}</span>}
      </span>
      {trailing !== undefined && <span class="hf-num shrink-0 font-medium">{trailing}</span>}
    </div>
  );
}
