import { formatBRL } from "../../domain/money/money";

/** Sinal de menos tipográfico (U+2212), como pede o handoff. */
export const MINUS = "−";

export interface MoneyParts {
  /** "", "+" ou "−". */
  sign: string;
  /** Inteiro com separador de milhar: "4.305". */
  whole: string;
  /** Centavos com a vírgula: ",30". */
  cents: string;
}

/**
 * Parte o valor para o desenho do saldo: "R$" e centavos menores e atenuados.
 *
 * Reaproveita o `Intl` de `formatBRL` e só recorta a string, em vez de refazer
 * a formatação: separador de milhar e vírgula continuam vindo de um lugar só.
 */
export function moneyParts(minor: number, signed: "auto" | "always" = "auto"): MoneyParts {
  const text = formatBRL(Math.abs(minor)).replace(/^R\$\s*/u, "");
  const comma = text.lastIndexOf(",");
  const sign = minor < 0 ? MINUS : signed === "always" && minor > 0 ? "+" : "";

  return {
    sign,
    whole: comma === -1 ? text : text.slice(0, comma),
    cents: comma === -1 ? "" : text.slice(comma),
  };
}

/** Texto corrido com sinal tipográfico: "−R$ 254,30", "+R$ 6.500,00". */
export function signedBRL(minor: number, signed: "auto" | "always" = "auto"): string {
  const { sign, whole, cents } = moneyParts(minor, signed);
  // Espaço rígido como o do `Intl`: o valor não quebra linha entre "R$" e o número.
  return `${sign}R$ ${whole}${cents}`;
}

const WHOLE = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Reais sem centavos ("R$ 2.412"): média é estimativa, centavo ali é falsa precisão. */
export function wholeBRL(minor: number): string {
  return WHOLE.format(Math.round(minor / 100));
}

export interface MoneyProps {
  minor: number;
  signed?: "auto" | "always";
  /** Tamanho do inteiro em px. "R$" sai a 50% e os centavos a ~60%. */
  size: number;
  class?: string;
  testId?: string;
}

/**
 * Valor grande (saldo, saldo do mês): "R$" 22px e centavos 26px a 60% sobre um
 * inteiro de 44px. Os centavos menores dão ritmo e deixam o número que importa
 * — os reais — ser lido primeiro.
 */
export function Money({ minor, signed = "auto", size, class: className = "", testId }: MoneyProps) {
  const { sign, whole, cents } = moneyParts(minor, signed);

  return (
    <span
      data-testid={testId}
      class={`hf-num inline-flex items-baseline font-medium tracking-[-0.02em] ${className}`.trim()}
      style={{ fontSize: `${size}px`, lineHeight: 1.05 }}
    >
      {/* O leitor de tela lê o valor inteiro de uma vez, não em três pedaços. */}
      <span class="sr-only">{signedBRL(minor, signed)}</span>
      <span aria-hidden="true" class="inline-flex items-baseline">
        {sign}
        <span class="mr-[0.18em] opacity-60" style={{ fontSize: "0.5em" }}>
          R$
        </span>
        {whole}
        <span class="opacity-60" style={{ fontSize: "0.6em" }}>
          {cents}
        </span>
      </span>
    </span>
  );
}
