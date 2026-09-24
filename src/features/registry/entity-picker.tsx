import type { Ulid } from "../../domain/ids/ulid";
import type { Category } from "../../domain/model/category";
import type { PaymentMethod } from "../../domain/model/payment-method";
import { cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";

export interface EntityPickerProps {
  /** Agrupa os rádios e prefixa os ids. Único na tela. */
  id: string;
  label: string;
  /** Texto da opção vazia. Ausência é escolha legítima, não erro. */
  emptyLabel: string;
  /** Mostrado quando não há nenhuma entidade cadastrada. */
  emptyHint: string;
  items: (Category | PaymentMethod)[];
  value: Ulid | null;
  /** Rótulo do registro apagado que ainda está selecionado, se houver. */
  deadLabel: string;
  onChange: (id: Ulid | null) => void;
  class?: string;
}

const LABEL = "hf-caption block text-[0.6875rem] font-semibold uppercase text-base-content/45";

const CHIP =
  "hf-press rounded-field flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm " +
  "transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

const SELECTED = "border-primary/40 bg-primary/10 text-base-content";
const IDLE = "border-base-content/10 bg-base-100/60 text-base-content/70";

/** Disco do ícone: tinta fraca da cor, como na lista de lançamentos. */
function tintOf(color: string) {
  const token = cssVarForToken(color);
  return { backgroundColor: `color-mix(in oklab, ${token} 15%, transparent)`, color: token };
}

interface ChipProps {
  name: string;
  label: string;
  icon: string | null;
  color: string;
  checked: boolean;
  onSelect: () => void;
}

function Chip({ name, label, icon, color, checked, onSelect }: ChipProps) {
  return (
    <label class={`${CHIP} ${checked ? SELECTED : IDLE}`}>
      {/*
        O nome acessível vem do texto do próprio rótulo, então nada de
        `aria-label`: ele venceria o texto e obrigaria a manter dois nomes em
        sincronia para o mesmo controle.
      */}
      <input
        type="radio"
        name={name}
        value={label}
        checked={checked}
        onChange={onSelect}
        class="sr-only"
      />
      <span
        aria-hidden="true"
        class="flex size-6 shrink-0 items-center justify-center rounded-full"
        style={icon === null ? { backgroundColor: "transparent" } : tintOf(color)}
      >
        {icon === null ? (
          <span class="size-2.5 rounded-full border border-base-content/25" />
        ) : (
          <Icon name={icon} size={13} />
        )}
      </span>
      <span class="max-w-[9rem] truncate">{label}</span>
    </label>
  );
}

/**
 * Escolha de categoria ou forma de pagamento como grade de opções, não `<select>`.
 *
 * O dropdown nativo não renderiza o ícone nem a cor da opção — nenhum navegador
 * estiliza o conteúdo de `<option>` —, e categoria e forma de pagamento existem
 * justamente para serem reconhecidas por cor e ícone antes do texto. A grade
 * mostra os dois no momento da escolha, e some com o popup do sistema, que é o
 * único pedaço da tela que o tema não alcança.
 *
 * São `<input type="radio">` de verdade, e não `<div role="radio">`: setas,
 * grupo, foco e leitor de tela vêm do navegador. Reimplementar isso à mão é onde
 * acessibilidade costuma quebrar em silêncio.
 */
export function EntityPicker({
  id,
  label,
  emptyLabel,
  emptyHint,
  items,
  value,
  deadLabel,
  onChange,
  class: className,
}: EntityPickerProps) {
  // Referência morta ainda selecionada: apagar não cascateia, então o lançamento
  // continua apontando para o registro deletado. Sem tratar este caso a seleção
  // sumiria sozinha ao abrir a edição de um lançamento antigo.
  const selectedIsDead = value !== null && !items.some((item) => item.id === value);

  return (
    <fieldset class={className}>
      <legend class={LABEL}>{label}</legend>

      {items.length === 0 && !selectedIsDead ? (
        // Grade vazia não diz o que fazer. O atalho diz.
        <p class="rounded-field mt-2 bg-base-200 px-3.5 py-2.5 text-sm text-base-content/55">
          {emptyHint}
        </p>
      ) : (
        <div class="mt-2 flex flex-wrap gap-2">
          <Chip
            name={id}
            label={emptyLabel}
            icon={null}
            color="slate"
            checked={value === null}
            onSelect={() => onChange(null)}
          />

          {selectedIsDead && (
            <Chip
              name={id}
              label={deadLabel}
              icon="tag"
              color="slate"
              checked
              onSelect={() => onChange(value)}
            />
          )}

          {items.map((item) => (
            <Chip
              key={item.id}
              name={id}
              label={item.name}
              icon={item.icon}
              color={item.color}
              checked={value === item.id}
              onSelect={() => onChange(item.id)}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}
