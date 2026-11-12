import { useState } from "preact/hooks";
import { BUSINESS_CATEGORIES, BUSINESS_METHODS } from "../../domain/defaults/defaults";
import type { ColorToken } from "../../domain/model/tokens";
import { Icon } from "../icons/icon";
import { BUSINESS_ICONS } from "../icons/icon-set";
import { describeError } from "../session/session";
import { Button } from "../ui/button";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { SheetHeader } from "../ui/modal";
import { Progress } from "../ui/progress";
import { Swatches } from "../ui/swatches";
import { IconTile } from "../ui/tile";
import { useSwipeNav } from "../ui/use-swipe-nav";
import type { BusinessDraft } from "./seed";

const STEPS = ["Negócio", "Aparência", "Prévia"] as const;
type Step = (typeof STEPS)[number];

const MAX_NAME = 40;

export interface BusinessWizardProps {
  /** Cria a conta e a ativa; rejeita sem gravar nada se falhar. */
  onCreate: (draft: BusinessDraft) => Promise<void>;
  onClose: () => void;
}

/**
 * "Criar conta comercial" em três etapas: nome do negócio, cor e ícone, e a prévia
 * do que será criado. Só a última grava, e grava tudo junto (a conta e o catálogo
 * de comércio): falhou, nada ficou pela metade e a pessoa tenta de novo.
 */
export function BusinessWizard({ onCreate, onClose }: BusinessWizardProps) {
  const [step, setStep] = useState<Step>("Negócio");
  const [dir, setDir] = useState<"next" | "back">("next");
  const [name, setName] = useState("");
  const [color, setColor] = useState<ColorToken>("sky");
  const [icon, setIcon] = useState<string>(BUSINESS_ICONS[0] ?? "store");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const index = STEPS.indexOf(step);
  // Cor e ícone já nascem com um padrão: só o nome pode barrar.
  const maxReachable = trimmed === "" ? 0 : STEPS.length - 1;

  function goTo(next: Step) {
    const target = STEPS.indexOf(next);
    if (target > maxReachable) {
      if (step === "Negócio") setProblem("Informe o nome do negócio.");
      return;
    }
    setProblem(null);
    setDir(target < index ? "back" : "next");
    setStep(next);
  }

  const swipe = useSwipeNav({ screens: STEPS, screen: step, enabled: !busy, onChange: goTo });
  // O arraste do app mora no <main>, que contém este sheet: sem parar a propagação,
  // arrastar o assistente trocaria de aba por baixo do modal.
  const stop = (handler: (event: PointerEvent) => void) => (event: PointerEvent) => {
    event.stopPropagation();
    handler(event);
  };

  async function create() {
    if (busy) return;
    if (trimmed === "") {
      setStep("Negócio");
      setProblem("Informe o nome do negócio.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await onCreate({ name: trimmed, color, icon });
      onClose();
    } catch (cause) {
      // Nada foi gravado: o lote é tudo ou nada, e as escolhas ficam para tentar de novo.
      setProblem(`Nada foi criado. ${describeError(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  function handleNext() {
    const next = STEPS[index + 1];
    if (next !== undefined) goTo(next);
  }

  return (
    <div class="flex flex-col">
      <SheetHeader title="Criar conta comercial" onClose={onClose} />

      <div class="mt-5">
        <Progress
          steps={STEPS}
          current={index}
          maxReachable={maxReachable}
          onGo={(i) => goTo(STEPS[i] ?? step)}
        />
      </div>

      <div class="mt-4 flex items-center justify-between">
        <h3 class={LABEL}>{step}</h3>
        <div class="flex gap-1">
          <button
            type="button"
            aria-label="Etapa anterior"
            disabled={index === 0}
            onClick={() => goTo(STEPS[index - 1] ?? step)}
            class="hf-press grid size-11 place-items-center rounded-lg text-fg/75 enabled:hover:bg-fg/[0.05] disabled:opacity-30"
          >
            <Icon name="caret-left" size={18} />
          </button>
          <button
            type="button"
            aria-label="Próxima etapa"
            disabled={index >= STEPS.length - 1}
            onClick={handleNext}
            class="hf-press grid size-11 place-items-center rounded-lg text-fg/75 enabled:hover:bg-fg/[0.05] disabled:opacity-30"
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
          {step === "Negócio" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleNext();
              }}
            >
              <label class={LABEL} for="business-name">
                Nome do negócio
              </label>
              <input
                id="business-name"
                name="business-name"
                type="text"
                autocomplete="off"
                maxLength={MAX_NAME}
                placeholder="Padaria, Studio de Beleza…"
                class={`${FIELD_SHEET} mt-2`}
                value={name}
                onInput={(event) => {
                  setProblem(null);
                  setName(event.currentTarget.value);
                }}
              />
              <p class={HINT}>
                A conta comercial começa vazia e separada da pessoal: os lançamentos de uma não
                aparecem na outra.
              </p>
            </form>
          )}

          {step === "Aparência" && (
            <>
              <Swatches
                name="business-color"
                legend="Cor do negócio"
                value={color}
                onChange={setColor}
                surface="surface"
              />
              <fieldset class="mt-6">
                <legend class={LABEL}>Ícone</legend>
                <div class="mt-2 grid grid-cols-6 gap-1.5">
                  {BUSINESS_ICONS.map((key) => {
                    const on = icon === key;
                    return (
                      <label
                        key={key}
                        class={`hf-press grid aspect-square cursor-pointer place-items-center rounded-lg
                          has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                            on
                              ? "hf-selected text-accent-200"
                              : "bg-bg text-fg/80 hover:bg-fg/[0.06]"
                          }`}
                      >
                        <input
                          type="radio"
                          name="business-icon"
                          value={key}
                          aria-label={key}
                          checked={on}
                          onChange={() => setIcon(key)}
                          class="sr-only"
                        />
                        <Icon name={key} size={22} />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}

          {step === "Prévia" && (
            <>
              <div class="flex items-center gap-3 rounded-lg bg-bg px-3.5 py-3">
                <IconTile icon={icon} color={color} size={42} iconSize={22} />
                <span class="min-w-0 flex-1">
                  <span
                    data-testid="business-preview-name"
                    class="block truncate text-[15px] font-medium"
                  >
                    {trimmed}
                  </span>
                  <span class="mt-0.5 block truncate text-xs text-fg/55">Conta comercial</span>
                </span>
              </div>
              <ul class="mt-3 space-y-2 text-sm text-fg/75">
                <li class="flex items-start gap-2">
                  <Icon name="check" size={16} class="mt-0.5 text-accent-300" />
                  {BUSINESS_CATEGORIES.length} categorias de comércio (Vendas, Fornecedores,
                  Aluguel…)
                </li>
                <li class="flex items-start gap-2">
                  <Icon name="check" size={16} class="mt-0.5 text-accent-300" />
                  {BUSINESS_METHODS.length} formas de pagamento (Pix, Dinheiro, Boleto…)
                </li>
                <li class="flex items-start gap-2">
                  <Icon name="check" size={16} class="mt-0.5 text-accent-300" />
                  Sua conta pessoal não muda
                </li>
              </ul>
              <p class={HINT}>
                Com o hub ligado, atualize todos os aparelhos e o hub antes de criar a conta: uma
                versão antiga mistura os lançamentos.
              </p>
            </>
          )}
        </div>
      </div>

      {problem !== null && (
        <p role="alert" class="mt-4 text-sm text-expense-fg">
          {problem}
        </p>
      )}

      <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
        {step === "Prévia" ? (
          <Button
            key="criar"
            icon="check"
            iconSide="left"
            class="flex-1"
            disabled={busy}
            onClick={create}
          >
            Criar conta comercial
          </Button>
        ) : (
          <Button key="continuar" icon="arrow-right" class="flex-1" onClick={handleNext}>
            Continuar
          </Button>
        )}
      </div>
    </div>
  );
}
