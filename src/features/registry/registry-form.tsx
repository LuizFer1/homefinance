import { useState } from "preact/hooks";
import type { CategoryDraft, PaymentKind, PaymentMethodDraft } from "../../domain/events/reference";
import type { CategoryRecord, PaymentMethodRecord } from "../../domain/projections/apply";
import { PAYMENT_KINDS } from "../../domain/projections/entities";
import { COLOR_TOKENS, cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";
import { ICON_KEYS } from "../icons/icon-set";

export type RegistryEntity = "category" | "paymentMethod";

export interface RegistryFormProps {
  entity: RegistryEntity;
  /**
   * Registro em edição, ou null para criação.
   *
   * A página monta este componente com `key` derivada do registro: trocar de
   * registro remonta o formulário e os inicializadores de `useState` releem as
   * props. Não reintroduza um `useEffect` de reset — ele roda depois do DOM
   * ficar consultável e sobrescreve o que o usuário já digitou.
   */
  editing: CategoryRecord | PaymentMethodRecord | null;
  /** Nomes já usados, para o aviso de duplicata. Inclui o próprio em edição. */
  existingNames: string[];
  onSubmit: (draft: CategoryDraft | PaymentMethodDraft) => void;
  onCancel: () => void;
}

const LABEL = "hf-caption block text-[0.6875rem] font-semibold uppercase text-base-content/45";
const FIELD =
  "rounded-field mt-1.5 w-full bg-base-200 px-3.5 py-2.5 text-base outline-none " +
  "transition-[box-shadow,background-color] duration-150 " +
  "focus-visible:bg-base-100 focus-visible:ring-2 focus-visible:ring-primary/45";

const KIND_LABELS: Record<PaymentKind, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit: "Cartão de crédito",
  debit: "Cartão de débito",
  other: "Outro",
};

const SWATCH =
  "hf-press flex size-8 cursor-pointer items-center justify-center rounded-full " +
  "transition-transform duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

const ICON_CHOICE =
  "hf-press flex size-9 cursor-pointer items-center justify-center rounded-field " +
  "transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

/** Comparação de duplicata: o usuário não distingue "Mercado" de " mercado ". */
function normalize(name: string): string {
  return name.trim().toLocaleLowerCase("pt-BR");
}

export function RegistryForm({
  entity,
  editing,
  existingNames,
  onSubmit,
  onCancel,
}: RegistryFormProps) {
  const isPayment = entity === "paymentMethod";
  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? (isPayment ? "wallet" : "tag"));
  const [color, setColor] = useState(editing?.color ?? "slate");
  // 'other' é o único default que não afirma nada errado sobre a forma. Nascer
  // 'credit' faria o formulário da fatia 3 oferecer cashback sem motivo.
  const [kind, setKind] = useState<PaymentKind>(
    ((editing as PaymentMethodRecord | null)?.kind as PaymentKind | undefined) ?? "other",
  );
  const [problem, setProblem] = useState<string | null>(null);

  function handleSubmit(event: Event) {
    event.preventDefault();

    const trimmed = name.trim();
    if (trimmed === "") {
      setProblem("Informe um nome.");
      return;
    }

    // Duplicata é decisão de produto, validada aqui e não no domínio: depois do
    // sync duas pessoas podem criar "Mercado" ao mesmo tempo legitimamente, e o
    // log aceita as duas. A tela avisa; o fold não rejeita.
    const conflicts = existingNames.filter(
      (existing) => normalize(existing) === normalize(trimmed),
    );
    const isOwnName = editing !== null && normalize(editing.name) === normalize(trimmed);
    if (conflicts.length > 0 && !isOwnName) {
      setProblem("Ja existe um item com esse nome.");
      return;
    }

    setProblem(null);
    onSubmit(
      isPayment
        ? ({ name: trimmed, icon, color, kind } as PaymentMethodDraft)
        : ({ name: trimmed, icon, color } as CategoryDraft),
    );

    if (editing === null) setName("");
  }

  return (
    <form onSubmit={handleSubmit} class="rounded-box mt-4 bg-base-100 p-4">
      <h2 class="hf-title text-[0.9375rem] font-semibold">
        {editing === null ? "Novo item" : "Editar item"}
      </h2>

      <div class="mt-3">
        <label class={LABEL} for="registry-name">
          Nome
        </label>
        <input
          id="registry-name"
          name="name"
          type="text"
          autocomplete="off"
          placeholder={isPayment ? "Nubank, vale refeição..." : "Mercado, transporte..."}
          class={FIELD}
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
        />
      </div>

      {isPayment && (
        <div class="mt-3">
          <label class={LABEL} for="registry-kind">
            Tipo de pagamento
          </label>
          <select
            id="registry-kind"
            name="kind"
            class={FIELD}
            value={kind}
            onChange={(event) => setKind(event.currentTarget.value as PaymentKind)}
          >
            {PAYMENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset class="mt-3">
        <legend class={LABEL}>Cor</legend>
        <div class="mt-1.5 flex flex-wrap gap-2">
          {COLOR_TOKENS.map((token) => (
            <label
              key={token}
              class={`${SWATCH} ${color === token ? "scale-110 ring-2 ring-base-content/35" : ""}`}
              style={{ backgroundColor: cssVarForToken(token) }}
            >
              <input
                type="radio"
                name="color"
                value={token}
                aria-label={token}
                checked={color === token}
                onChange={() => setColor(token)}
                class="sr-only"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset class="mt-3">
        <legend class={LABEL}>Ícone</legend>
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          {ICON_KEYS.map((key) => (
            <label
              key={key}
              class={`${ICON_CHOICE} ${
                icon === key ? "bg-base-300 text-base-content" : "bg-base-200 text-base-content/55"
              }`}
            >
              <input
                type="radio"
                name="icon"
                value={key}
                aria-label={key}
                checked={icon === key}
                onChange={() => setIcon(key)}
                class="sr-only"
              />
              <Icon name={key} />
            </label>
          ))}
        </div>
      </fieldset>

      {problem !== null && (
        <p role="alert" class="mt-3 text-sm text-error">
          {problem}
        </p>
      )}

      <div class="mt-4 flex gap-2">
        <button
          type="submit"
          class="hf-press rounded-field flex-1 bg-primary py-2.5 font-medium text-primary-content"
        >
          {editing === null ? "Adicionar" : "Salvar"}
        </button>
        {editing !== null && (
          <button
            type="button"
            onClick={onCancel}
            class="hf-press rounded-field bg-base-200 px-4 py-2.5 font-medium text-base-content/70"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
