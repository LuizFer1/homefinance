import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Icon } from "../icons/icon";
import { describeError } from "../session/session";
import { Button } from "../ui/button";
import { LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { SheetHeader } from "../ui/modal";
import { Progress } from "../ui/progress";
import { useSwipeNav } from "../ui/use-swipe-nav";

export interface StepSheetProps {
  title: string;
  /** Nomes das etapas, na ordem. A última é a prévia, onde mora o botão que grava. */
  steps: readonly string[];
  /** Por que a etapa `index` não deixa avançar, ou nulo. Só olha os campos dela. */
  validate: (index: number) => string | null;
  /** Aviso ao vivo da etapa atual (ex.: saldo maior que o original); some quando a pessoa corrige. */
  liveProblem?: string | null;
  renderStep: (step: string) => ComponentChildren;
  /** Rótulo do botão da prévia, que nomeia a ação ("Salvar bem"). */
  finishLabel: string;
  /** Grava; rejeitar mantém o sheet aberto com o motivo e as escolhas intactas. */
  onFinish: () => Promise<unknown>;
  /** Só na edição: a lixeira que exige segurar. */
  onDelete?: () => Promise<unknown>;
  deleteLabel?: string;
  onClose: () => void;
}

/**
 * Esqueleto multi-etapa dos sheets de bens e dívidas (regra do projeto: formulário
 * nunca é uma tela longa só): `Progress`, setas, arraste, e a última etapa mostra o
 * que será gravado. Só ela grava.
 *
 * O avanço é travado pela primeira etapa inválida: dá para voltar e pular para trás
 * à vontade, mas não para a prévia com o nome em branco.
 */
export function StepSheet({
  title,
  steps,
  validate,
  liveProblem = null,
  renderStep,
  finishLabel,
  onFinish,
  onDelete,
  deleteLabel = "Excluir",
  onClose,
}: StepSheetProps) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  // Falha ao gravar/excluir: fica até a pessoa navegar ou tentar de novo.
  const [problem, setProblem] = useState<string | null>(null);
  // Tentou avançar com a etapa inválida: o aviso acompanha o campo e some quando ela
  // corrige, em vez de ficar grudado depois do erro já resolvido.
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const last = steps.length - 1;
  const step = steps[index] ?? "";
  const firstInvalid = steps.findIndex((_, i) => i < last && validate(i) !== null);
  const maxReachable = firstInvalid === -1 ? last : firstInvalid;

  function goTo(requested: number) {
    const target = Math.max(0, Math.min(requested, maxReachable));
    setProblem(null);
    setBlocked(target < requested);
    if (target === index) return;
    setDir(target < index ? "back" : "next");
    setIndex(target);
  }

  const swipe = useSwipeNav({
    screens: steps,
    screen: step,
    enabled: !busy,
    onChange: (next) => goTo(steps.indexOf(next)),
  });
  // O arraste do app mora no <main>, que contém este sheet: sem parar a propagação,
  // arrastar o formulário trocaria de aba por baixo do modal.
  const stop = (handler: (event: PointerEvent) => void) => (event: PointerEvent) => {
    event.stopPropagation();
    handler(event);
  };

  async function run(work: () => Promise<unknown>, failure: string) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setBlocked(false);
    try {
      await work();
      onClose();
    } catch (cause) {
      // O sheet fica aberto: as escolhas continuam na tela para tentar de novo.
      setProblem(`${failure} ${describeError(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    if (firstInvalid !== -1) {
      goTo(last);
      return;
    }
    void run(onFinish, "Não foi salvo.");
  }

  const shown = problem ?? (blocked ? validate(index) : null) ?? liveProblem;

  return (
    <div class="flex flex-col">
      <SheetHeader
        title={title}
        onClose={onClose}
        actions={
          onDelete === undefined ? undefined : (
            <HoldToDelete
              label={deleteLabel}
              onConfirm={() => void run(onDelete, "Não foi excluído.")}
            />
          )
        }
      />

      <div class="mt-5">
        <Progress steps={steps} current={index} maxReachable={maxReachable} onGo={(i) => goTo(i)} />
      </div>

      <div class="mt-4 flex items-center justify-between">
        <h3 class={LABEL}>{step}</h3>
        <div class="flex gap-1">
          <button
            type="button"
            aria-label="Etapa anterior"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            class="hf-press grid size-11 place-items-center rounded-lg text-fg/75 enabled:hover:bg-fg/[0.05] disabled:opacity-30"
          >
            <Icon name="caret-left" size={18} />
          </button>
          <button
            type="button"
            aria-label="Próxima etapa"
            disabled={index >= last}
            onClick={() => goTo(index + 1)}
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
        <form
          key={step}
          data-dir={dir}
          class="hf-step mt-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (index < last) goTo(index + 1);
          }}
        >
          {renderStep(step)}
          {/* Enter num campo avança: sem botão de envio, o form nativo não dispararia `submit`. */}
          <button type="submit" class="sr-only" tabIndex={-1} aria-hidden="true" />
        </form>
      </div>

      {shown !== null && (
        <p role="alert" class="mt-4 text-sm text-expense-fg">
          {shown}
        </p>
      )}

      <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
        {index === last ? (
          <Button
            key="salvar"
            icon="check"
            iconSide="left"
            class="flex-1"
            disabled={busy}
            onClick={finish}
          >
            {finishLabel}
          </Button>
        ) : (
          <Button key="continuar" icon="arrow-right" class="flex-1" onClick={() => goTo(index + 1)}>
            Continuar
          </Button>
        )}
      </div>
    </div>
  );
}
