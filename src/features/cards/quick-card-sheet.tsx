import { useState } from "preact/hooks";
import { cardCycleText } from "../../domain/cards/card";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
import type { ColorToken } from "../../domain/model/tokens";
import { Icon } from "../icons/icon";
import { describeError } from "../session/session";
import { Button } from "../ui/button";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { SheetHeader } from "../ui/modal";
import { Progress } from "../ui/progress";
import { Swatches } from "../ui/swatches";
import { useSwipeNav } from "../ui/use-swipe-nav";
import { CardFields, type CardFieldsValue, cardFieldsProblem, parseCardDay } from "./card-fields";
import { CardMark } from "./card-mark";
import { cardDraft } from "./plan";

export interface QuickCardSheetProps {
  /** Nomes de formas de pagamento já usados, para o aviso de duplicata. */
  existingNames: string[];
  /**
   * A mesma escrita do cadastro normal (`registry.addPaymentMethod`). Rejeita se
   * não gravou: o sheet fica aberto, com o erro, e nada fica pela metade.
   */
  onCreate: (draft: PaymentMethodDraft) => Promise<PaymentMethod>;
  /** O cartão já gravado: quem abriu o sheet o seleciona no seu lugar. */
  onCreated: (card: PaymentMethod) => void;
  onCancel: () => void;
}

const STEPS = ["Cartão", "Nome e cor", "Prévia"] as const;

function normalize(name: string): string {
  return name.trim().toLocaleLowerCase("pt-BR");
}

/**
 * Cadastro rápido de cartão de crédito: só o essencial (banco, fechamento,
 * vencimento, nome e cor), em três etapas, para quem está no meio de um
 * lançamento ou de uma importação.
 *
 * Os campos e a validação do passo "Cartão" são os do `RegistryWizard`
 * (`CardFields`/`cardFieldsProblem`), e o rascunho é o `cardDraft` da migração:
 * os três caminhos de criar cartão gravam a mesma forma de linha. Nada é gravado
 * antes do botão final, em uma única escrita — cancelar não deixa cartão pela
 * metade. O nome em branco vale o banco.
 */
export function QuickCardSheet({
  existingNames,
  onCreate,
  onCreated,
  onCancel,
}: QuickCardSheetProps) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [card, setCard] = useState<CardFieldsValue>({ bank: "", closingDay: "", dueDay: "" });
  const [name, setName] = useState("");
  const [color, setColor] = useState<ColorToken>("violet");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const bank = card.bank.trim();
  const effectiveName = name.trim() !== "" ? name.trim() : bank;
  const duplicate =
    effectiveName !== "" && existingNames.some((n) => normalize(n) === normalize(effectiveName));
  const cardProblem = cardFieldsProblem(card);
  const nameProblem = duplicate ? "Já existe uma forma de pagamento com esse nome." : null;
  const maxReachable = cardProblem !== null ? 0 : nameProblem !== null ? 1 : STEPS.length - 1;
  const current = STEPS[step] ?? STEPS[0];
  const isLast = step === STEPS.length - 1;

  function goTo(index: number) {
    const target = Math.max(0, Math.min(index, STEPS.length - 1));
    if (target > step) {
      if (cardProblem !== null) {
        setProblem(cardProblem);
        return;
      }
      if (target > 1 && nameProblem !== null) {
        setProblem(nameProblem);
        return;
      }
    }
    setProblem(null);
    setDir(target < step ? "back" : "next");
    setStep(target);
  }

  const swipe = useSwipeNav({
    screens: STEPS,
    screen: current,
    enabled: true,
    onChange: (label) => goTo(STEPS.indexOf(label)),
  });
  // O arraste do app inteiro mora no <main>: sem parar a propagação, arrastar o
  // sheet trocaria de aba por baixo do modal.
  const stop = (handler: (event: PointerEvent) => void) => (event: PointerEvent) => {
    event.stopPropagation();
    handler(event);
  };

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (saving || !isLast) return;
    if (cardProblem !== null) {
      setStep(0);
      setProblem(cardProblem);
      return;
    }
    if (nameProblem !== null) {
      setStep(1);
      setProblem(nameProblem);
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const created = await onCreate(
        cardDraft({
          bank: card.bank,
          name,
          closingDay: parseCardDay(card.closingDay) as number,
          dueDay: parseCardDay(card.dueDay) as number,
          color,
        }),
      );
      onCreated(created);
    } catch (cause) {
      setProblem(`Não foi possível salvar o cartão. ${describeError(cause)}`);
      setSaving(false);
    }
  }

  const cycle =
    cardCycleText({
      kind: "credit",
      bank,
      closingDay: parseCardDay(card.closingDay),
      dueDay: parseCardDay(card.dueDay),
    } as PaymentMethod) ?? "";

  return (
    <form onSubmit={(event) => void handleSubmit(event)} class="flex flex-col">
      <SheetHeader title="Novo cartão de crédito" onClose={onCancel} />

      <div class="mt-5">
        <Progress steps={STEPS} current={step} maxReachable={maxReachable} onGo={goTo} />
      </div>

      <div class="mt-4 flex items-center justify-between">
        <h3 class={LABEL}>{current}</h3>
        <div class="flex gap-1">
          <button
            type="button"
            aria-label="Etapa anterior"
            disabled={step === 0}
            onClick={() => goTo(step - 1)}
            class="hf-press grid size-9 place-items-center rounded-lg text-fg/75 enabled:hover:bg-fg/[0.05] disabled:opacity-30"
          >
            <Icon name="caret-left" size={18} />
          </button>
          <button
            type="button"
            aria-label="Próxima etapa"
            disabled={step >= maxReachable}
            onClick={() => goTo(step + 1)}
            class="hf-press grid size-9 place-items-center rounded-lg text-fg/75 enabled:hover:bg-fg/[0.05] disabled:opacity-30"
          >
            <Icon name="caret-right" size={18} />
          </button>
        </div>
      </div>

      <div
        class="touch-pan-y"
        onPointerDown={stop(swipe.onPointerDown)}
        onPointerMove={stop(swipe.onPointerMove)}
        onPointerUp={stop(swipe.onPointerUp)}
        onPointerCancel={stop(swipe.onPointerCancel)}
        data-swiping={swipe["data-swiping"]}
        style={swipe.style}
      >
        <div key={step} data-dir={dir} class="hf-step mt-2">
          {step === 0 && <CardFields idPrefix="quick-card" value={card} onChange={setCard} />}

          {step === 1 && (
            <>
              <label class={LABEL} for="quick-card-name">
                Nome
              </label>
              <input
                id="quick-card-name"
                type="text"
                autocomplete="off"
                placeholder={bank}
                class={`${FIELD_SHEET} mt-2`}
                value={name}
                onInput={(event) => setName(event.currentTarget.value)}
              />
              <p class={HINT}>Em branco, vale o banco ({bank}).</p>
              <p class={`${LABEL} mt-5`}>Cor do cartão</p>
              <Swatches
                name="quick-card-color"
                legend="Cor do cartão"
                value={color}
                onChange={setColor}
                class="mt-3"
                surface="surface"
              />
            </>
          )}

          {step === 2 && (
            <div class="flex min-h-16 items-center gap-3 rounded-lg bg-bg px-3.5">
              <CardMark color={color} size={38} />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-medium">{effectiveName}</span>
                <span
                  data-testid="quick-card-preview"
                  class="mt-1 block truncate text-xs text-fg/55"
                >
                  {bank !== effectiveName ? `${bank} · ` : ""}
                  {cycle}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {problem !== null && (
        <p role="alert" class="mt-4 text-sm text-expense-fg">
          {problem}
        </p>
      )}

      {/* `key` distintas: ver o comentário do RegistryWizard sobre o clique que submetia cedo. */}
      <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
        <Button
          key="voltar"
          variant="secondary"
          onClick={() => (step === 0 ? onCancel() : goTo(step - 1))}
        >
          {step === 0 ? "Cancelar" : "Voltar"}
        </Button>
        {isLast ? (
          <Button
            key="salvar"
            type="submit"
            icon="check"
            iconSide="left"
            class="flex-1"
            disabled={saving}
          >
            Salvar cartão
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

/** Atalho para o sheet, no mesmo lugar onde se escolhe a forma de pagamento. */
export function NewCardButton({
  onClick,
  class: className = "",
}: {
  onClick: () => void;
  class?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`hf-press flex h-11 w-full items-center justify-center gap-2 rounded-lg border
        border-dashed border-accent/60 text-sm font-medium text-accent-300 hover:bg-accent/10 ${className}`.trim()}
    >
      <Icon name="plus" size={16} />
      Novo cartão de crédito
    </button>
  );
}
