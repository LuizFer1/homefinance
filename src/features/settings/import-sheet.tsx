import { useState } from "preact/hooks";
import type { PrepareResult } from "../../data/import";
import type { ImportPlan } from "../../domain/export/import-data";
import { TABLE_NAMES, type TableName } from "../../domain/model/app-state";
import { Icon } from "../icons/icon";
import { describeError, StaleRowsError } from "../session/session";
import { Button, SECONDARY } from "../ui/button";
import { HINT, LABEL } from "../ui/field";
import { SheetHeader } from "../ui/modal";
import { Progress } from "../ui/progress";
import { useSwipeNav } from "../ui/use-swipe-nav";
import { TABLE_LABELS } from "./export-sheet";

const STEPS = ["Arquivo", "Prévia"] as const;
type Step = (typeof STEPS)[number];

export interface ImportSheetProps {
  /** Lê, valida e planeja o arquivo. Não grava nada. */
  onPrepare: (file: File) => Promise<PrepareResult>;
  /** Grava o plano num lote só; rejeita (`StaleRowsError` inclusive) sem gravar nada. */
  onApply: (plan: ImportPlan) => Promise<void>;
  onClose: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function rowTotal(plan: ImportPlan, table: TableName): number {
  const c = plan.counts[table];
  return c.created + c.updated + c.deleted + c.ignored;
}

/**
 * Importação em duas etapas: escolher o arquivo e conferir a prévia. Nada é
 * gravado antes do botão final, que diz quantas linhas entram. Importar nunca
 * apaga o que já está no aparelho; a prévia mostra por tabela o que entra.
 */
export function ImportSheet({ onPrepare, onApply, onClose }: ImportSheetProps) {
  const [step, setStep] = useState<Step>("Arquivo");
  const [dir, setDir] = useState<"next" | "back">("next");
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const index = STEPS.indexOf(step);
  // A prévia só existe com um plano válido; depois de importar, nada a repetir.
  const maxReachable = plan !== null ? 1 : 0;

  function goTo(next: Step) {
    if (STEPS.indexOf(next) > maxReachable) return;
    setDir(STEPS.indexOf(next) < index ? "back" : "next");
    setStep(next);
  }

  const swipe = useSwipeNav({ screens: STEPS, screen: step, enabled: true, onChange: goTo });
  // O arraste do app inteiro mora no <main>: sem parar a propagação, arrastar o
  // sheet trocaria de aba por baixo do modal.
  const stop = (handler: (event: PointerEvent) => void) => (event: PointerEvent) => {
    event.stopPropagation();
    handler(event);
  };

  async function choose(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined || reading) return;
    setReading(true);
    setProblem(null);
    setPlan(null);
    setDone(null);
    setFileName(file.name);
    try {
      const result = await onPrepare(file);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      setPlan(result.plan);
      setDir("next");
      setStep("Prévia");
    } catch (cause) {
      setProblem(`Não foi possível ler o arquivo. ${describeError(cause)}`);
    } finally {
      // Permite escolher o mesmo arquivo de novo (o `change` não dispararia).
      input.value = "";
      setReading(false);
    }
  }

  async function run() {
    if (busy || plan === null || plan.total === 0) return;
    setBusy(true);
    setProblem(null);
    try {
      await onApply(plan);
      setDone(plan.total);
      setPlan(null);
      setDir("back");
      setStep("Arquivo");
    } catch (cause) {
      if (cause instanceof StaleRowsError) {
        // O banco mudou depois da leitura: a prévia está velha. Nada foi gravado.
        setProblem(
          "Os dados mudaram em outra aba ou no sync. Nada foi importado. Escolha o arquivo de novo para recalcular a prévia.",
        );
        setPlan(null);
        setDir("back");
        setStep("Arquivo");
      } else {
        setProblem(`Não foi possível importar. ${describeError(cause)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const listed = plan === null ? [] : TABLE_NAMES.filter((t) => rowTotal(plan, t) > 0);

  return (
    <div class="flex flex-col">
      <SheetHeader title="Importar dados" onClose={onClose} />

      <div class="mt-5">
        <Progress
          steps={STEPS}
          current={index}
          maxReachable={maxReachable}
          onGo={(i) => goTo(STEPS[i] ?? step)}
        />
      </div>

      <div class="mt-4 flex items-center justify-between">
        <h3 class={LABEL}>{step === "Arquivo" ? "Escolha o arquivo" : "Prévia da importação"}</h3>
        <div class="flex gap-1">
          <button
            type="button"
            aria-label="Etapa anterior"
            disabled={index === 0}
            onClick={() => goTo(STEPS[index - 1] ?? step)}
            class="hf-press grid size-9 place-items-center rounded-lg text-fg/75 enabled:hover:bg-fg/[0.05] disabled:opacity-30"
          >
            <Icon name="caret-left" size={18} />
          </button>
          <button
            type="button"
            aria-label="Próxima etapa"
            disabled={index >= maxReachable}
            onClick={() => goTo(STEPS[index + 1] ?? step)}
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
          {step === "Arquivo" && (
            <>
              <div class="rounded-lg bg-bg px-3.5 py-3.5">
                <p class="text-[15px] font-medium">Arquivo gerado em Exportar</p>
                <p class="mt-2 text-sm leading-normal text-fg/70 text-pretty">
                  Escolha o arquivo JSON do HomeFinance. Nada é gravado antes de você conferir a
                  prévia e confirmar. Importar não apaga o que já está neste aparelho: só entra o
                  que o arquivo tem de novo ou de mais recente.
                </p>
              </div>
              <label
                class={`${SECONDARY} mt-3 w-full cursor-pointer has-[:focus-visible]:outline-2
                  has-[:focus-visible]:outline-accent ${reading ? "pointer-events-none opacity-45" : ""}`}
              >
                <Icon name="upload-simple" size={18} />
                {reading ? "Lendo o arquivo…" : "Escolher arquivo"}
                <input
                  type="file"
                  accept="application/json,.json"
                  aria-label="Escolher arquivo"
                  disabled={reading}
                  onChange={choose}
                  class="sr-only"
                />
              </label>
              {reading && (
                <p role="status" class="mt-3 text-sm text-fg/60">
                  Lendo e conferindo {fileName}…
                </p>
              )}
              {done !== null && (
                <p role="status" class="mt-3 text-sm text-income-fg">
                  {plural(done, "linha importada", "linhas importadas")}.
                </p>
              )}
              {problem !== null && (
                <p role="alert" class="mt-3 text-sm text-expense-fg">
                  {problem}
                </p>
              )}
            </>
          )}

          {step === "Prévia" && plan !== null && (
            <>
              <div class="rounded-lg bg-bg px-3.5 py-3">
                <p class="break-all text-[15px] font-medium">{fileName}</p>
                <p class={HINT}>
                  {plan.total === 0
                    ? "Este aparelho já tem tudo o que o arquivo traz."
                    : `${plural(plan.total, "linha entra", "linhas entram")} neste aparelho. Nada do que já está aqui é apagado.`}
                </p>
              </div>
              {listed.length > 0 && (
                <ul aria-label="Conteúdo do arquivo" class="mt-3 overflow-hidden rounded-lg bg-bg">
                  {listed.map((table) => {
                    const c = plan.counts[table];
                    return (
                      <li key={table} class="border-b border-divider px-3.5 py-2.5 last:border-b-0">
                        <p class="text-[15px]">{TABLE_LABELS[table]}</p>
                        <p class="hf-num mt-0.5 text-xs text-fg/60">
                          {c.created} novas · {c.updated} atualizadas · {c.deleted} apagadas ·{" "}
                          {c.ignored} ignoradas
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
              {plan.unknownTables.length > 0 && (
                <p class={`${HINT} mt-3`}>
                  O arquivo traz dados de uma versão mais nova que este app não entende (
                  {plan.unknownTables.join(", ")}). Eles foram ignorados.
                </p>
              )}
              {problem !== null && (
                <p role="alert" class="mt-3 text-sm text-expense-fg">
                  {problem}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
        <Button
          variant="secondary"
          onClick={() => (index === 0 || done !== null ? onClose() : goTo("Arquivo"))}
        >
          {index === 0 || done !== null ? "Fechar" : "Voltar"}
        </Button>
        {step === "Prévia" && plan !== null && (
          <Button
            key="importar"
            icon="upload-simple"
            iconSide="left"
            class="flex-1"
            disabled={busy || plan.total === 0}
            onClick={run}
          >
            {plan.total === 0
              ? "Nada para importar"
              : `Importar ${plural(plan.total, "linha", "linhas")}`}
          </Button>
        )}
      </div>
    </div>
  );
}
