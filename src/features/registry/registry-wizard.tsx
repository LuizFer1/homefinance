import { useState } from "preact/hooks";
import type { Category, CategoryDraft, CategoryKind } from "../../domain/model/category";
import {
  PAYMENT_KINDS,
  type PaymentKind,
  type PaymentMethod,
  type PaymentMethodDraft,
} from "../../domain/model/payment-method";
import { Icon } from "../icons/icon";
import { PICKABLE_ICONS } from "../icons/icon-set";
import { Button } from "../ui/button";
import { RadioChip } from "../ui/chip";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { SheetHeader } from "../ui/modal";
import { MINUS } from "../ui/money";
import { Progress } from "../ui/progress";
import { Segmented } from "../ui/segmented";
import { SummaryChip } from "../ui/summary-chip";
import { Swatches } from "../ui/swatches";
import { IconTile } from "../ui/tile";

export type RegistryEntity = "category" | "paymentMethod";

export interface RegistryWizardProps {
  entity: RegistryEntity;
  /** Registro em edição, ou null para criação. Montado com `key` pela página. */
  editing: Category | PaymentMethod | null;
  /** Nomes já usados, para o aviso de duplicata. Inclui o próprio em edição. */
  existingNames: string[];
  onSubmit: (draft: CategoryDraft | PaymentMethodDraft) => void;
  onCancel: () => void;
  /** Só na edição: segurar a lixeira do cabeçalho exclui o registro. */
  onDelete?: () => void;
}

const STEPS = ["Nome", "Ícone", "Cor"] as const;

/** Nome do tipo na lista de Pagamentos (meta da linha). */
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  credit: "Crédito",
  debit: "Débito",
  cash: "Dinheiro",
  pix: "Pix",
  other: "Outro",
};

const PAYMENT_KIND_ICONS: Record<PaymentKind, string> = {
  credit: "credit-card",
  debit: "credit-card",
  cash: "banknote",
  pix: "zap",
  other: "wallet",
};

/** Ordem do handoff: os que liberam cashback primeiro. */
const PAYMENT_KIND_ORDER: readonly PaymentKind[] = ["credit", "debit", "cash", "pix", "other"];

const WHERE: { value: CategoryKind; label: string }[] = [
  { value: "expense", label: "Despesas" },
  { value: "income", label: "Receitas" },
  { value: "both", label: "Ambos" },
];

const WHERE_CONTEXT: Record<CategoryKind, string> = {
  expense: "aparece em despesas",
  income: "aparece em receitas",
  both: "aparece nos dois",
};

/** Comparação de duplicata: o usuário não distingue "Mercado" de " mercado ". */
function normalize(name: string): string {
  return name.trim().toLocaleLowerCase("pt-BR");
}

/**
 * Cadastro de entidade de referência em três etapas: Nome → Ícone → Cor.
 *
 * Nome e tipo ficam juntos na primeira: são os dados de identidade — o que a
 * coisa é. Ícone e cor são aparência. Três etapas para as duas entidades, então
 * a barra de progresso não muda de tamanho conforme a tela.
 */
export function RegistryWizard({
  entity,
  editing,
  existingNames,
  onSubmit,
  onCancel,
  onDelete,
}: RegistryWizardProps) {
  const isPayment = entity === "paymentMethod";
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? (isPayment ? "wallet" : "tag"));
  const [color, setColor] = useState(editing?.color ?? "slate");
  // 'other' é o único default que não afirma nada errado sobre a forma. Nascer
  // 'credit' faria o formulário de lançamento oferecer cashback sem motivo.
  const [kind, setKind] = useState<PaymentKind>(
    isPayment && (PAYMENT_KINDS as readonly string[]).includes(editing?.kind ?? "")
      ? (editing?.kind as PaymentKind)
      : "other",
  );
  // 'both' pelo mesmo raciocínio, invertido: esconder a categoria de um dos
  // formulários por padrão faria ela parecer apagada. Oferecer demais incomoda;
  // sumir parece bug.
  const [categoryKind, setCategoryKind] = useState<CategoryKind>(
    !isPayment && ["expense", "income", "both"].includes(editing?.kind ?? "")
      ? (editing?.kind as CategoryKind)
      : "both",
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
    // banco aceita as duas. A tela avisa; o repositório não rejeita.
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
    setDir(index < step ? "back" : "next");
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
        : ({ name: trimmed, icon, color, kind: categoryKind } as CategoryDraft),
    );
  }

  const isLast = step === STEPS.length - 1;
  const noun = isPayment ? "forma de pagamento" : "categoria";
  const title = editing === null ? `Nova ${noun}` : `Editar ${noun}`;
  const context = isPayment ? PAYMENT_KIND_LABELS[kind] : WHERE_CONTEXT[categoryKind];

  return (
    <form onSubmit={handleSubmit} class="flex flex-col">
      <SheetHeader
        title={title}
        onClose={onCancel}
        actions={
          editing !== null && onDelete !== undefined ? (
            <HoldToDelete label={`Excluir ${editing.name}`} onConfirm={onDelete} />
          ) : undefined
        }
      />

      <div class="mt-5">
        <Progress steps={STEPS} current={step} maxReachable={maxReachable} onGo={goTo} />
      </div>

      <div key={step} data-dir={dir} class="hf-step mt-5">
        {step === 0 && (
          <>
            <label class={LABEL} for="registry-name">
              Nome
            </label>
            <input
              id="registry-name"
              name="name"
              type="text"
              autocomplete="off"
              placeholder={isPayment ? "Nubank, vale refeição…" : "Mercado, transporte…"}
              class={`${FIELD_SHEET} mt-2`}
              value={name}
              onInput={(event) => setName(event.currentTarget.value)}
            />

            {isPayment ? (
              <div class="mt-5">
                <fieldset aria-label="Tipo de pagamento">
                  <legend class={LABEL}>Tipo</legend>
                  <div class="mt-2 flex flex-wrap gap-2">
                    {PAYMENT_KIND_ORDER.map((value) => (
                      <RadioChip
                        key={value}
                        name="kind"
                        value={value}
                        icon={PAYMENT_KIND_ICONS[value]}
                        checked={kind === value}
                        onSelect={() => setKind(value)}
                      >
                        {PAYMENT_KIND_LABELS[value]}
                      </RadioChip>
                    ))}
                  </div>
                </fieldset>
                <p class={`${HINT} flex items-start gap-2`}>
                  <Icon name="coins" size={16} class="mt-px text-accent-300" />
                  Crédito e débito liberam o campo de cashback no lançamento.
                </p>
              </div>
            ) : (
              <div class="mt-5">
                <p class={LABEL}>Onde aparece</p>
                <Segmented
                  name="categoryKind"
                  legend="Onde aparece"
                  class="mt-2"
                  options={WHERE}
                  value={categoryKind}
                  onChange={setCategoryKind}
                />
                <p class={HINT}>
                  Decide em qual formulário a categoria é oferecida. "Ambos" serve aos dois —
                  investimento e transferência costumam ser assim.
                </p>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <fieldset>
            <SummaryChip title={trimmed} context={context} />
            <legend class="sr-only">Ícone</legend>
            <div class="mt-2 grid grid-cols-7 gap-1.5">
              {PICKABLE_ICONS.map((key) => {
                const on = icon === key;
                return (
                  <label
                    key={key}
                    class={`hf-press grid aspect-square cursor-pointer place-items-center rounded-lg
                      has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                        on ? "hf-selected text-accent-200" : "bg-bg text-fg/80 hover:bg-fg/[0.06]"
                      }`}
                  >
                    <input
                      type="radio"
                      name="icon"
                      value={key}
                      aria-label={key}
                      checked={on}
                      onChange={() => setIcon(key)}
                      class="sr-only"
                    />
                    <Icon name={key} size={21} />
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <>
            <Swatches
              name="color"
              legend="Cor"
              value={color}
              onChange={setColor}
              surface="surface"
            />

            {/* Prévia: é a primeira vez que ícone e cor aparecem juntos, onde vão morar. */}
            <p class={`${LABEL} mt-7`}>Prévia</p>
            <div class="mt-2 flex h-16 items-center gap-3 rounded-lg bg-bg px-3.5">
              <IconTile icon={icon} color={color} size={38} iconSize={19} />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-medium">
                  {isPayment ? "Mercado" : "Exemplo"}
                </span>
                <span class="mt-1 block truncate text-xs text-fg/55">
                  {isPayment ? `Alimentação · ${trimmed}` : `${trimmed} · Pix`}
                </span>
              </span>
              <span class="hf-num text-[15px] font-medium">{MINUS}R$ 42,90</span>
            </div>
          </>
        )}
      </div>

      {problem !== null && (
        <p role="alert" class="mt-4 text-sm text-expense-fg">
          {problem}
        </p>
      )}

      {/*
        As `key` distintas não são decoração: sem elas os dois botões ocupam a
        mesma posição no JSX, o Preact reaproveita o nó e só troca o atributo
        `type`. O navegador executa a activation behavior do botão **depois**
        do handler — então o clique em "Continuar" avançava a etapa, o nó virava
        `submit`, e o formulário era submetido, criando o item antes da hora.
      */}
      <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
        {step > 0 && (
          <Button key="voltar" variant="secondary" onClick={() => goTo(step - 1)}>
            Voltar
          </Button>
        )}
        {isLast ? (
          <Button key="enviar" type="submit" icon="check" iconSide="left" class="flex-1">
            {editing === null ? "Adicionar" : "Salvar"}
          </Button>
        ) : (
          <Button key="avancar" icon="arrow-right" class="flex-1" onClick={() => goTo(step + 1)}>
            Continuar
          </Button>
        )}
      </div>
    </form>
  );
}
