import { useState } from "preact/hooks";
import { exportFileName } from "../../domain/export/export-data";
import { type AppState, TABLE_NAMES, type TableName } from "../../domain/model/app-state";
import { Icon } from "../icons/icon";
import { describeError } from "../session/session";
import { Button } from "../ui/button";
import { HINT, LABEL } from "../ui/field";
import { SheetHeader } from "../ui/modal";
import { Progress } from "../ui/progress";
import { useSwipeNav } from "../ui/use-swipe-nav";

const STEPS = ["Aviso", "Arquivo"] as const;
type Step = (typeof STEPS)[number];

/** `Record` e não array: tabela nova sem rótulo não compila. */
export const TABLE_LABELS: Record<TableName, string> = {
  users: "Perfis",
  categories: "Categorias",
  paymentMethods: "Formas de pagamento",
  transactions: "Lançamentos",
  recurrences: "Recorrências",
  recurrenceAdjustments: "Reajustes de recorrência",
  reserves: "Reservas",
  reserveMovements: "Movimentos de reserva",
  budgets: "Metas por categoria",
};

export interface ExportSheetProps {
  /** Só para a prévia (contagens); o conteúdo do arquivo vem do banco, em `onExport`. */
  state: AppState;
  /** Data de hoje em 'YYYY-MM-DD'; vira o nome do arquivo. */
  today: string;
  /** Lê o banco e baixa o arquivo; rejeita se não conseguiu. */
  onExport: () => Promise<void>;
  onClose: () => void;
}

/**
 * Exportação em duas etapas: o aviso de privacidade e a prévia do arquivo.
 *
 * O aviso vem antes do botão de baixar porque o arquivo é texto puro com todos
 * os valores, e a pessoa decide onde guardá-lo; o app não tem como protegê-lo
 * depois que sai do aparelho.
 */
export function ExportSheet({ state, today, onExport, onClose }: ExportSheetProps) {
  const [step, setStep] = useState<Step>("Aviso");
  const [dir, setDir] = useState<"next" | "back">("next");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const index = STEPS.indexOf(step);
  const fileName = exportFileName(today);

  function goTo(next: Step) {
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

  async function download() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setDone(false);
    try {
      await onExport();
      setDone(true);
    } catch (cause) {
      setProblem(`Não foi possível gerar o arquivo. ${describeError(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  // Apagados entram no arquivo (como lápides), mas a pessoa vê o que vê no app.
  const counts = TABLE_NAMES.map((table) => ({
    table,
    count: Object.values(state[table]).filter((row) => row.deletedAt === null).length,
  })).filter((item) => item.count > 0);

  return (
    <div class="flex flex-col">
      <SheetHeader title="Exportar dados" onClose={onClose} />

      <div class="mt-5">
        <Progress
          steps={STEPS}
          current={index}
          maxReachable={STEPS.length - 1}
          onGo={(i) => goTo(STEPS[i] ?? step)}
        />
      </div>

      <div class="mt-4 flex items-center justify-between">
        <h3 class={LABEL}>{step === "Aviso" ? "Antes de baixar" : "Prévia do arquivo"}</h3>
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
            disabled={index === STEPS.length - 1}
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
          {step === "Aviso" && (
            <div class="rounded-lg bg-bg px-3.5 py-3.5">
              <p class="flex items-center gap-2 text-[15px] font-medium">
                <Icon name="warning" size={18} class="text-fg/70" />
                <span>O arquivo não é protegido</span>
              </p>
              <p class="mt-2 text-sm leading-normal text-fg/70 text-pretty">
                Ele é um texto simples com todos os seus valores, descrições e categorias. Quem
                abrir o arquivo lê tudo. Guarde-o onde só você acessa.
              </p>
              <p class="mt-2 text-sm leading-normal text-fg/70 text-pretty">
                Nada sai pela internet: o arquivo é montado neste aparelho e vai direto para a sua
                pasta de downloads. As credenciais do hub não entram nele.
              </p>
            </div>
          )}

          {step === "Arquivo" && (
            <>
              <div class="rounded-lg bg-bg px-3.5 py-3">
                <p class="break-all text-[15px] font-medium">{fileName}</p>
                <p class={HINT}>Inclui também o que você apagou, para uma restauração futura.</p>
              </div>
              <ul aria-label="Conteúdo" class="mt-3 overflow-hidden rounded-lg bg-bg">
                {counts.length === 0 ? (
                  <li class="px-3.5 py-3 text-sm text-fg/60">Ainda não há dados neste aparelho.</li>
                ) : (
                  counts.map((item) => (
                    <li
                      key={item.table}
                      class="flex min-h-11 items-center gap-3 border-b border-divider px-3.5 py-2 last:border-b-0"
                    >
                      <span class="min-w-0 flex-1 text-[15px]">{TABLE_LABELS[item.table]}</span>
                      <span class="hf-num text-sm text-fg/60">{item.count}</span>
                    </li>
                  ))
                )}
              </ul>
              {problem !== null && (
                <p role="alert" class="mt-4 text-sm text-expense-fg">
                  {problem}
                </p>
              )}
              {done && (
                <p role="status" class="mt-4 text-sm text-income-fg">
                  Arquivo gerado. Confira a pasta de downloads.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
        <Button
          variant="secondary"
          onClick={() => (index === 0 ? onClose() : goTo(STEPS[index - 1] ?? step))}
        >
          {index === 0 ? "Fechar" : "Voltar"}
        </Button>
        {index === 0 ? (
          <Button key="avancar" icon="arrow-right" class="flex-1" onClick={() => goTo("Arquivo")}>
            Entendi, continuar
          </Button>
        ) : (
          <Button
            key="baixar"
            icon="download-simple"
            iconSide="left"
            class="flex-1"
            disabled={busy}
            onClick={download}
          >
            Baixar arquivo
          </Button>
        )}
      </div>
    </div>
  );
}
