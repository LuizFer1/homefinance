import { Icon } from "../icons/icon";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Nome Phosphor opcional, à esquerda do rótulo. */
  icon?: string;
  /** Peso do ícone quando a opção está marcada (Aparência → "Escuro" preenchido). */
  iconFillWhenOn?: boolean;
  /**
   * Tom semântico: a opção marcada pinta na cor de receita ou despesa em vez
   * do acento. Só o segmentado Despesa/Receita usa — lá a cor **é** a resposta.
   */
  tone?: "income" | "expense";
}

export interface SegmentedProps<T extends string> {
  /** `name` do grupo de rádios. Único na tela. */
  name: string;
  /** Rótulo do grupo para leitor de tela. */
  legend: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * `pill`: trilho de fundo com a opção ativa em cápsula (Despesa/Receita,
   * abas de Categorias). `bordered`: células divididas por régua (Frequência,
   * Aparência, Onde aparece).
   */
  variant?: "pill" | "bordered";
  /** Texto de 13px para caber cinco opções na largura do celular (Frequência). */
  dense?: boolean;
  class?: string;
}

const TONE_ON: Record<"income" | "expense", string> = {
  income:
    "bg-income/[0.14] text-income-fg shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-income)_50%,transparent)]",
  expense:
    "bg-expense/[0.14] text-expense-fg shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-expense)_50%,transparent)]",
};

/**
 * Rádios nativos com cara de segmentado.
 *
 * `<input type="radio">` de verdade, e não botões com `aria-pressed`: setas,
 * grupo, foco e anúncio do leitor de tela vêm do navegador.
 */
export function Segmented<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  variant = "bordered",
  dense = false,
  class: className = "",
}: SegmentedProps<T>) {
  const pill = variant === "pill";
  // Com tom semântico o segmentado mora no sheet (trilho `bg`); sem tom, na
  // página (trilho `surface`, opção ativa afundada em `bg`), como no handoff.
  const toned = options.some((option) => option.tone !== undefined);

  return (
    // `aria-label` no grupo, além da legenda: é o que deixa o grupo ser achado
    // pelo nome ("Onde aparece", "Tipo") como um campo comum do formulário.
    <fieldset class={className} aria-label={legend}>
      <legend class="sr-only">{legend}</legend>
      <div
        class={
          pill
            ? `flex gap-1 rounded-lg p-[3px] ${toned ? "bg-bg" : "bg-surface"}`
            : "flex overflow-hidden rounded-lg border border-divider"
        }
      >
        {options.map((option, index) => {
          const on = option.value === value;
          const toneOn =
            option.tone === undefined
              ? pill
                ? "bg-bg font-medium text-fg shadow-[inset_0_0_0_1px_var(--color-neutral-700)]"
                : "bg-accent-900 font-medium text-accent-200 shadow-[inset_0_0_0_1px_var(--color-accent)]"
              : TONE_ON[option.tone];

          return (
            <label
              key={option.value}
              class={`hf-press flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5
                ${dense ? "px-0.5 text-[13px]" : "text-sm"} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent
                ${pill ? "h-10 rounded-md" : "h-11"}
                ${!pill && index > 0 ? "border-l border-divider" : ""}
                ${on ? toneOn : "text-fg/60 hover:text-fg"}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={on}
                onChange={() => onChange(option.value)}
                class="sr-only"
              />
              {option.icon !== undefined && (
                <Icon
                  name={option.icon}
                  size={16}
                  weight={on && option.iconFillWhenOn ? "fill" : "regular"}
                />
              )}
              <span class="truncate">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
