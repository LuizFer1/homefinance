import { useState } from "preact/hooks";
import type { CategoryDraft, PaymentKind, PaymentMethodDraft } from "../../domain/events/reference";
import type { CategoryRecord, PaymentMethodRecord } from "../../domain/projections/apply";
import { PAYMENT_KINDS } from "../../domain/projections/entities";
import { COLOR_TOKENS, cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";
import { ICON_KEYS } from "../icons/icon-set";
import { StepIndicator } from "../transactions/step-indicator";

export type RegistryEntity = "category" | "paymentMethod";

export interface RegistryWizardProps {
  entity: RegistryEntity;
  /** Registro em edição, ou null para criação. Montado com `key` pela página. */
  editing: CategoryRecord | PaymentMethodRecord | null;
  /** Nomes já usados, para o aviso de duplicata. Inclui o próprio em edição. */
  existingNames: string[];
  onSubmit: (draft: CategoryDraft | PaymentMethodDraft) => void;
  onCancel: () => void;
}

const STEPS = ["Nome", "Ícone", "Cor"] as const;

const LABEL = "hf-caption block text-[0.6875rem] font-semibold uppercase text-base-content/45";
const FIELD =
  "rounded-field mt-1.5 w-full bg-base-200 px-3.5 py-2.5 text-base outline-none " +
  "transition-[box-shadow,background-color] duration-150 " +
  "focus-visible:bg-base-100 focus-visible:ring-2 focus-visible:ring-primary/45";
const ACTION = "hf-press rounded-field px-4 py-2.5 font-medium";

const KIND_LABELS: Record<PaymentKind, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit: "Cartão de crédito",
  debit: "Cartão de débito",
  other: "Outro",
};

const SWATCH =
  "hf-press flex size-10 cursor-pointer items-center justify-center rounded-full " +
  "transition-transform duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

const ICON_CHOICE =
  "hf-press rounded-field flex size-11 cursor-pointer items-center justify-center " +
  "border transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

/** Comparação de duplicata: o usuário não distingue "Mercado" de " mercado ". */
function normalize(name: string): string {
  return name.trim().toLocaleLowerCase("pt-BR");
}

/**
 * Cadastro de entidade de referência em três etapas.
 *
 * Nome e tipo ficam juntos na primeira: são os dados de identidade — o que a
 * coisa é. Ícone e cor são aparência. Isso mantém três etapas para as duas
 * entidades, então o indicador não muda de tamanho conforme a tela.
 */
export function RegistryWizard({
  entity,
  editing,
  existingNames,
  onSubmit,
  onCancel,
}: RegistryWizardProps) {
  const isPayment = entity === "paymentMethod";
  const [step, setStep] = useState(0);
  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? (isPayment ? "wallet" : "tag"));
  const [color, setColor] = useState(editing?.color ?? "slate");
  // 'other' é o único default que não afirma nada errado sobre a forma. Nascer
  // 'credit' faria o formulário de lançamento oferecer cashback sem motivo.
  const [kind, setKind] = useState<PaymentKind>(
    ((editing as PaymentMethodRecord | null)?.kind as PaymentKind | undefined) ?? "other",
  );
  const [problem, setProblem] = useState<string | null>(null);

  const trimmed = name.trim();
  const conflicts = existingNames.some((existing) => normalize(existing) === normalize(trimmed));
  const isOwnName = editing !== null && normalize(editing.name) === normalize(trimmed);
  const nameValid = trimmed !== "" && (!conflicts || isOwnName);
  // Ícone e cor já nascem com um padrão, então nunca bloqueiam.
  const maxReachable = nameValid ? STEPS.length - 1 : 0;

  function validateName(): boolean {
    if (trimmed === "") {
      setProblem("Informe um nome.");
      return false;
    }
    // Duplicata é decisão de produto, validada aqui e não no domínio: depois do
    // sync duas pessoas podem criar "Mercado" ao mesmo tempo legitimamente, e o
    // log aceita as duas. A tela avisa; o fold não rejeita.
    if (conflicts && !isOwnName) {
      setProblem("Ja existe um item com esse nome.");
      return false;
    }
    setProblem(null);
    return true;
  }

  function goTo(index: number) {
    if (step === 0 && index > 0 && !validateName()) return;
    setProblem(null);
    setStep(index);
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!validateName()) {
      setStep(0);
      return;
    }

    onSubmit(
      isPayment
        ? ({ name: trimmed, icon, color, kind } as PaymentMethodDraft)
        : ({ name: trimmed, icon, color } as CategoryDraft),
    );
  }

  const isLast = step === STEPS.length - 1;

  return (
    <form onSubmit={handleSubmit} class="p-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="hf-title font-semibold">{editing === null ? "Novo item" : "Editar item"}</h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fechar"
          class="hf-press rounded-field px-2 py-1 text-lg leading-none text-base-content/45"
        >
          &times;
        </button>
      </div>

      <div class="mt-4">
        <StepIndicator steps={STEPS} current={step} maxReachable={maxReachable} onGo={goTo} />
      </div>

      <div class="mt-5">
        {step === 0 && (
          <>
            <div>
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
                <p class="mt-1.5 text-xs text-base-content/45">
                  Cartão de crédito ou débito libera o campo de cashback no lançamento.
                </p>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <fieldset>
            <legend class={LABEL}>Ícone</legend>
            <div class="mt-2 flex flex-wrap gap-2">
              {ICON_KEYS.map((key) => (
                <label
                  key={key}
                  class={`${ICON_CHOICE} ${
                    icon === key
                      ? "border-primary/40 bg-primary/10 text-base-content"
                      : "border-base-content/10 bg-base-100/60 text-base-content/55"
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
                  <Icon name={key} size={20} />
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <legend class={LABEL}>Cor</legend>
            <div class="mt-2 flex flex-wrap gap-2.5">
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

            {/* Prévia: é a primeira vez que ícone e cor aparecem juntos. */}
            <div class="rounded-box mt-4 flex items-center gap-3 border border-base-content/10 bg-base-100/60 px-4 py-3">
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-full text-base-100"
                style={{ backgroundColor: cssVarForToken(color) }}
              >
                <Icon name={icon} />
              </span>
              <span class="min-w-0 truncate text-sm">{trimmed || "Sem nome"}</span>
            </div>
          </fieldset>
        )}
      </div>

      {problem !== null && (
        <p role="alert" class="mt-3 text-sm text-error">
          {problem}
        </p>
      )}

      <div class="mt-5 flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            class={`${ACTION} bg-base-200 text-base-content/70`}
          >
            Voltar
          </button>
        )}

        {isLast ? (
          <button type="submit" class={`${ACTION} flex-1 bg-primary text-primary-content`}>
            {editing === null ? "Adicionar" : "Salvar"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goTo(step + 1)}
            class={`${ACTION} flex-1 bg-primary text-primary-content`}
          >
            Continuar
          </button>
        )}
      </div>
    </form>
  );
}
