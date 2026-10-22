import { useMemo, useState } from "preact/hooks";
import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import { dayMonth } from "../../domain/projections/periods";
import { findSimilar, type SimilarQuery } from "../../domain/transactions/similar";
import { describeError, StaleRowsError } from "../session/session";
import { Button } from "../ui/button";
import { HINT } from "../ui/field";
import { SheetHeader } from "../ui/modal";
import { signedBRL } from "../ui/money";
import { Progress } from "../ui/progress";
import { IconTile } from "../ui/tile";
import { useSwipeNav } from "../ui/use-swipe-nav";

const STEPS = ["Semelhantes", "Prévia"] as const;

export interface SimilarSheetProps {
  state: AppState;
  query: SimilarQuery;
  /** Grava a categoria nos lançamentos de uma vez; rejeita sem gravar nada se falhar. */
  onApply: (ids: Ulid[], categoryId: Ulid) => Promise<number>;
  onClose: () => void;
}

/**
 * "Aplicar às semelhantes": depois de reclassificar uma compra, oferece levar a
 * mesma categoria às outras da mesma loja. Duas etapas — marcar e conferir a
 * prévia — e só o botão final grava, num lote só (tudo ou nada).
 *
 * A lista vem do `state` vivo, não de uma foto: se o sync trouxer ou tirar um
 * lançamento com a folha aberta, a contagem acompanha. Quem já foi alterado
 * deixa de ser "semelhante" (já está na categoria) e sai sozinho.
 */
export function SimilarSheet({ state, query, onApply, onClose }: SimilarSheetProps) {
  const items = useMemo(() => findSimilar(state, query), [state, query]);
  // Começa tudo marcado: o usuário acabou de dizer que aquela loja é daquela
  // categoria. Nada grava antes de "Aplicar" na prévia.
  const [unpicked, setUnpicked] = useState<ReadonlySet<Ulid>>(new Set());
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const category = state.categories[query.categoryId] ?? null;
  const selected = items.filter((item) => !unpicked.has(item.id));
  // Desmarcar tudo rebaixa a etapa em vez de deixar a prévia vazia.
  const maxReachable = selected.length === 0 ? 0 : STEPS.length - 1;
  const current = Math.min(step, maxReachable);

  function goToIndex(index: number) {
    const next = Math.max(0, Math.min(index, maxReachable));
    setDir(next < current ? "back" : "next");
    setStep(next);
  }

  const swipe = useSwipeNav({
    screens: STEPS,
    screen: STEPS[current] ?? "Semelhantes",
    enabled: true,
    onChange: (id) => goToIndex(STEPS.indexOf(id)),
  });
  // O arraste do app inteiro mora no <main>, que contém este sheet.
  const stop = (handler: (event: PointerEvent) => void) => (event: PointerEvent) => {
    event.stopPropagation();
    handler(event);
  };

  function toggle(id: Ulid) {
    setProblem(null);
    setUnpicked((currentSet) => {
      const next = new Set(currentSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onApply(
        selected.map((item) => item.id),
        query.categoryId,
      );
      onClose();
    } catch (cause) {
      // Lote tudo ou nada: nada foi alterado, a seleção fica para tentar de novo.
      setProblem(
        cause instanceof StaleRowsError
          ? "Nada foi alterado. Algum lançamento mudou em outra aba ou na sincronização. Volte e confira a lista."
          : `Nada foi alterado. ${describeError(cause)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const allPicked = items.length > 0 && selected.length === items.length;
  const count = (n: number) => `${n} ${n === 1 ? "lançamento" : "lançamentos"}`;

  return (
    <div class="flex flex-col">
      <SheetHeader title="Aplicar às semelhantes" onClose={onClose} />

      {items.length === 0 || category === null ? (
        <div class="mt-6">
          <h3 class="text-lg font-medium">Nada a alterar</h3>
          <p class={HINT}>Nenhum outro lançamento da mesma loja precisa mudar de categoria.</p>
          <div class="mt-5">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      ) : (
        <>
          <div class="mt-5">
            <Progress
              steps={STEPS}
              current={current}
              maxReachable={maxReachable}
              onGo={goToIndex}
            />
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
            <div key={current} data-dir={dir} class="hf-step mt-5">
              {current === 0 && (
                <>
                  <p class="text-sm text-fg/75">
                    Outros {count(items.length)} de{" "}
                    <span class="font-medium">{query.description}</span> não estão em{" "}
                    <span class="font-medium text-fg">{category.name}</span>.
                  </p>
                  <div class="mt-3 flex items-center justify-between gap-3">
                    <p class="text-[13px] text-fg/55">
                      {selected.length} de {items.length} marcados
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setUnpicked(allPicked ? new Set(items.map((item) => item.id)) : new Set())
                      }
                      class="hf-press text-[13px] font-medium text-accent-300"
                    >
                      {allPicked ? "Desmarcar todos" : "Marcar todos"}
                    </button>
                  </div>

                  <ul class="mt-2 overflow-hidden rounded-lg bg-bg">
                    {items.map((item) => {
                      const income = item.kind === "income";
                      const was =
                        item.categoryId === null ? null : state.categories[item.categoryId];
                      return (
                        <li key={item.id} class="border-b border-divider last:border-b-0">
                          <label class="flex min-h-14 cursor-pointer items-center gap-3 px-3.5 py-2.5">
                            <input
                              type="checkbox"
                              checked={!unpicked.has(item.id)}
                              onChange={() => toggle(item.id)}
                              aria-label={`Selecionar ${item.description} de ${dayMonth(item.occurredOn)}`}
                              class="size-5 shrink-0 accent-[var(--color-accent)]"
                            />
                            <span class="min-w-0 flex-1">
                              <span class="block truncate text-[15px] font-medium">
                                {item.description}
                              </span>
                              <span class="mt-0.5 block truncate text-xs text-fg/55">
                                {dayMonth(item.occurredOn)} · {was?.name ?? "Sem categoria"}
                              </span>
                            </span>
                            <span
                              class={`hf-num shrink-0 text-[15px] font-medium ${income ? "text-income-fg" : ""}`}
                            >
                              {signedBRL(income ? item.amountMinor : -item.amountMinor, "always")}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {current === 1 && (
                <>
                  <div class="flex items-center gap-3 rounded-lg bg-bg px-3.5 py-3">
                    <IconTile icon={category.icon} color={category.color} size={30} iconSize={17} />
                    <p class="min-w-0 flex-1 text-sm text-fg/75">
                      {selected.length === 1
                        ? "1 lançamento passa para "
                        : `${selected.length} lançamentos passam para `}
                      <span class="font-medium text-fg">{category.name}</span>
                    </p>
                  </div>

                  <ul aria-label="Prévia" class="mt-3 overflow-hidden rounded-lg bg-bg">
                    {selected.map((item) => {
                      const income = item.kind === "income";
                      const was =
                        item.categoryId === null ? null : state.categories[item.categoryId];
                      return (
                        <li
                          key={item.id}
                          class="flex min-h-12 items-center gap-3 border-b border-divider px-3.5 py-2 last:border-b-0"
                        >
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-[15px] font-medium">
                              {item.description}
                            </span>
                            <span class="mt-0.5 block truncate text-xs text-fg/55">
                              {dayMonth(item.occurredOn)} · {was?.name ?? "Sem categoria"} →{" "}
                              {category.name}
                            </span>
                          </span>
                          <span
                            class={`hf-num shrink-0 text-[15px] font-medium ${income ? "text-income-fg" : ""}`}
                          >
                            {signedBRL(income ? item.amountMinor : -item.amountMinor, "always")}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {problem !== null && (
                    <p role="alert" class="mt-4 text-sm text-expense-fg">
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
              onClick={() => (current === 0 ? onClose() : goToIndex(current - 1))}
            >
              {current === 0 ? "Agora não" : "Voltar"}
            </Button>
            {current < STEPS.length - 1 ? (
              <Button
                key="avancar"
                icon="arrow-right"
                class="flex-1"
                disabled={current >= maxReachable}
                onClick={() => goToIndex(current + 1)}
              >
                Continuar
              </Button>
            ) : (
              <Button
                key="aplicar"
                icon="check"
                iconSide="left"
                class="flex-1"
                disabled={busy}
                onClick={apply}
              >
                Aplicar a {selected.length}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
