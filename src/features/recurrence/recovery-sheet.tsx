import { useMemo, useState } from "preact/hooks";
import type { LostOccurrence } from "../../domain/recurrence/plan";
import { groupBySeries } from "../../domain/recurrence/recovery";
import { StepSheet } from "../business/step-sheet";
import { Icon } from "../icons/icon";
import { HINT } from "../ui/field";
import { signedBRL } from "../ui/money";
import { periodLabel } from "./adjust-sheet";

const STEPS = ["Lançamentos", "Prévia"] as const;

export interface RecoverySheetProps {
  /** As candidatas (`recoveryCandidates`): nunca vazio quando o sheet abre. */
  lost: readonly LostOccurrence[];
  /** Grava as duas escolhas num lote; rejeitar mantém o sheet aberto. */
  onApply: (recreate: LostOccurrence[], dismiss: LostOccurrence[]) => Promise<unknown>;
  onClose: () => void;
}

const keyOf = (item: LostOccurrence) => item.draft.occurrenceKey ?? item.entityId;

function count(n: number): string {
  return n === 1 ? "1 lançamento" : `${n} lançamentos`;
}

/** O rótulo do botão nomeia o que vai acontecer, inclusive com nada marcado. */
export function recoveryLabel(recreate: number, dismiss: number): string {
  return recreate > 0 ? `Recriar ${count(recreate)}` : `Não recriar ${count(dismiss)}`;
}

function Amount({ item }: { item: LostOccurrence }) {
  const income = item.draft.kind === "income";
  return (
    <span
      class={`hf-num shrink-0 text-[15px] font-medium ${income ? "text-income-fg" : "text-expense-fg"}`}
    >
      {item.anchored ? "~" : ""}
      {signedBRL(income ? item.draft.amountMinor : -item.draft.amountMinor, "always")}
    </span>
  );
}

function When({ item }: { item: LostOccurrence }) {
  return <span class="text-xs text-fg/55">{periodLabel(item.draft.occurredOn)}</span>;
}

/**
 * "Recuperar lançamentos" (spec do id estável, §6, decisão D1): competências de
 * séries recorrentes que a colisão do id engoliu. Nada passado é recriado sem
 * esta pergunta — quem lançou à mão ficaria com dois.
 *
 * Duas etapas: marcar o que recriar (tudo vem marcado) e conferir a prévia, que
 * lista as duas escolhas. Desmarcada é "Não recriar": vira um tombstone, e
 * nenhum aparelho pergunta de novo. Fechar sem confirmar não grava nada.
 */
export function RecoverySheet({ lost, onApply, onClose }: RecoverySheetProps) {
  const groups = useMemo(() => groupBySeries(lost), [lost]);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());

  const recreate = lost.filter((item) => !skipped.has(keyOf(item)));
  const dismiss = lost.filter((item) => skipped.has(keyOf(item)));

  function toggle(item: LostOccurrence) {
    setSkipped((current) => {
      const next = new Set(current);
      const key = keyOf(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allOn = skipped.size === 0;

  function renderStep(step: string) {
    if (step === "Lançamentos") {
      return (
        <>
          <p class={HINT}>
            Estes lançamentos de recorrentes deveriam existir e não foram gravados por uma falha já
            corrigida. Desmarque o que você já lançou à mão.
          </p>
          <div class="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setSkipped(allOn ? new Set(lost.map(keyOf)) : new Set())}
              class="hf-press text-[13px] font-medium text-accent-300"
            >
              {allOn ? "Desmarcar todos" : "Marcar todos"}
            </button>
          </div>
          {groups.map((group) => (
            <section key={group.seriesId} class="mt-3">
              <h4 class="text-sm font-medium">{group.description}</h4>
              <ul class="mt-1.5 overflow-hidden rounded-lg bg-bg">
                {group.items.map((item) => (
                  <li key={keyOf(item)} class="border-b border-divider last:border-b-0">
                    <label class="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2">
                      <input
                        type="checkbox"
                        checked={!skipped.has(keyOf(item))}
                        onChange={() => toggle(item)}
                        aria-label={`Recriar ${group.description} de ${periodLabel(item.draft.occurredOn)}`}
                        class="size-5 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span class="min-w-0 flex-1">
                        <When item={item} />
                      </span>
                      <Amount item={item} />
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      );
    }
    return (
      <>
        <PreviewList title={`Recriar (${recreate.length})`} items={recreate} />
        <PreviewList title={`Não recriar (${dismiss.length})`} items={dismiss} />
        {dismiss.length > 0 && (
          <p class={HINT}>
            Os que não forem recriados não serão oferecidos de novo, em nenhum aparelho.
          </p>
        )}
      </>
    );
  }

  return (
    <StepSheet
      title="Recuperar lançamentos"
      steps={STEPS}
      validate={() => null}
      renderStep={renderStep}
      finishLabel={recoveryLabel(recreate.length, dismiss.length)}
      onFinish={() => onApply(recreate, dismiss)}
      onClose={onClose}
    />
  );
}

/**
 * Convite discreto, como o da versão nova: a pergunta pode esperar a pessoa
 * terminar o que está fazendo. Some sozinho quando não há mais candidatas.
 */
export function RecoveryBanner({ count: n, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <div
      role="status"
      class="mb-4 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm"
    >
      <Icon name="repeat" size={18} />
      <p class="min-w-0 flex-1 text-fg/85">
        {n === 1
          ? "1 lançamento de recorrente não foi gravado."
          : `${n} lançamentos de recorrentes não foram gravados.`}
      </p>
      <button
        type="button"
        onClick={onOpen}
        class="hf-press shrink-0 rounded-md px-2 py-1 font-medium text-accent-300 hover:bg-accent/15"
      >
        Revisar
      </button>
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: readonly LostOccurrence[] }) {
  if (items.length === 0) return null;
  return (
    <section class="mt-3">
      <h4 class="text-sm font-medium">{title}</h4>
      <ul aria-label={title} class="mt-1.5 overflow-hidden rounded-lg bg-bg">
        {items.map((item) => (
          <li
            key={keyOf(item)}
            class="flex min-h-12 items-center gap-3 border-b border-divider px-3.5 py-2 last:border-b-0"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-medium">{item.draft.description}</span>
              <When item={item} />
            </span>
            <Amount item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
