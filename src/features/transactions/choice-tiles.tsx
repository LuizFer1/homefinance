import { IconTile } from "../ui/tile";

export interface ChoiceProps {
  name: string;
  icon: string;
  /** `null` = opção neutra ("Sem categoria"). */
  color: string | null;
  checked: boolean;
  onSelect: () => void;
  /** `name` do grupo de rádios; muda para o filtro não dividir grupo com o wizard. */
  group?: string;
}

/**
 * Tile da grade de categoria (3 colunas, 80px): ícone em cima, nome embaixo.
 *
 * Rádio nativo escondido: o nome acessível é o texto do próprio `<label>`, então
 * nada de `aria-label` — ele venceria o texto e obrigaria a manter dois nomes.
 */
export function CategoryTile({
  name,
  icon,
  color,
  checked,
  onSelect,
  group = "categoryId",
}: ChoiceProps) {
  return (
    <label
      class={`hf-press flex h-20 cursor-pointer flex-col justify-between rounded-lg p-2.5
        has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
          checked ? "hf-selected" : "bg-bg hover:bg-fg/[0.04]"
        }`}
    >
      <input
        type="radio"
        name={group}
        value={name}
        checked={checked}
        onChange={onSelect}
        class="sr-only"
      />
      <IconTile icon={icon} color={color} size={30} iconSize={17} />
      <span
        class={`truncate text-[12.5px] font-medium ${checked ? "text-accent-200" : "text-fg/85"}`}
      >
        {name}
      </span>
    </label>
  );
}

/** Linha de 52px da lista de pagamento: tile, nome e rádio à direita. */
export function MethodRow({
  name,
  icon,
  color,
  checked,
  onSelect,
  first,
  group = "paymentMethodId",
}: ChoiceProps & { first?: boolean }) {
  return (
    <label
      class="relative flex h-[52px] cursor-pointer items-center gap-3 px-3
        has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2
        has-[:focus-visible]:outline-accent hover:bg-fg/[0.03]"
    >
      {/* Régua recuada até o texto, que esmaece antes da borda. */}
      {!first && <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-[54px]" />}
      <input
        type="radio"
        name={group}
        value={name}
        checked={checked}
        onChange={onSelect}
        class="sr-only"
      />
      <IconTile icon={icon} color={color} size={30} iconSize={17} />
      <span class={`min-w-0 flex-1 truncate text-[15px] ${color === null ? "text-fg/60" : ""}`}>
        {name}
      </span>
      <span
        aria-hidden="true"
        class="size-5 shrink-0 rounded-full"
        style={{
          boxShadow: checked
            ? "inset 0 0 0 1.5px var(--color-accent), inset 0 0 0 5px var(--color-bg), inset 0 0 0 10px var(--color-accent)"
            : "inset 0 0 0 1.5px var(--color-neutral-700)",
        }}
      />
    </label>
  );
}
