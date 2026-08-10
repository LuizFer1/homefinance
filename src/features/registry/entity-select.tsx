import type { Ulid } from "../../domain/ids/ulid";
import type { CategoryRecord, PaymentMethodRecord } from "../../domain/projections/apply";
import { cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";

export interface EntitySelectProps {
  id: string;
  label: string;
  /** Texto da opção vazia. Ausência é escolha legítima, não erro. */
  emptyLabel: string;
  /** Chamada quando não há nenhuma entidade cadastrada. */
  emptyHint: string;
  items: (CategoryRecord | PaymentMethodRecord)[];
  value: Ulid | null;
  /** Rótulo do registro apagado que ainda está selecionado, se houver. */
  deadLabel: string;
  onChange: (id: Ulid | null) => void;
  class?: string;
}

const FIELD =
  "rounded-field mt-1.5 w-full bg-base-200 px-3.5 py-2.5 text-base outline-none " +
  "transition-[box-shadow,background-color] duration-150 " +
  "focus-visible:bg-base-100 focus-visible:ring-2 focus-visible:ring-primary/45";

const LABEL = "hf-caption block text-[0.6875rem] font-semibold uppercase text-base-content/45";

export function EntitySelect({
  id,
  label,
  emptyLabel,
  emptyHint,
  items,
  value,
  deadLabel,
  onChange,
  class: className,
}: EntitySelectProps) {
  // Referência morta ainda selecionada: apagar não cascateia, então o lançamento
  // continua apontando para o registro deletado. Filtrar sem tratar este caso
  // faria a seleção sumir sozinha ao abrir a edição de um lançamento antigo.
  const selectedIsDead = value !== null && !items.some((item) => item.id === value);
  const selected = items.find((item) => item.id === value) ?? null;

  return (
    <div class={className}>
      <label class={LABEL} for={id}>
        {label}
      </label>

      {items.length === 0 && !selectedIsDead ? (
        // Dropdown vazio não diz o que fazer. O atalho diz.
        <p class="rounded-field mt-1.5 bg-base-200 px-3.5 py-2.5 text-sm text-base-content/55">
          {emptyHint}
        </p>
      ) : (
        <div class="relative">
          {/*
            O ícone e a cor da opção escolhida ficam fora do <select>: navegador
            nenhum estiliza o conteúdo de <option>, então mostrá-los ao lado do
            campo é o que torna a escolha reconhecível sem ler o texto.
          */}
          <span
            aria-hidden="true"
            class="pointer-events-none absolute top-1/2 left-3 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-base-100"
            style={{
              backgroundColor: cssVarForToken(selected?.color ?? "slate"),
              opacity: selected === null ? 0.35 : 1,
            }}
          >
            <Icon name={selected?.icon ?? "tag"} size={14} />
          </span>

          <select
            id={id}
            class={`${FIELD} pl-11`}
            value={value ?? ""}
            onChange={(event) => onChange(event.currentTarget.value || null)}
          >
            <option value="">{emptyLabel}</option>
            {selectedIsDead && <option value={value ?? ""}>{deadLabel}</option>}
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
