import { useMemo, useState } from "preact/hooks";
import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import type { Transaction } from "../../domain/model/transaction";
import { dayMonth } from "../../domain/projections/periods";
import { listCategories, listTransactions } from "../../domain/projections/selectors";
import { suggestionsFor, uncategorized } from "../../domain/projections/uncategorized";
import { describeError } from "../session/session";
import { Button } from "../ui/button";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { SheetHeader } from "../ui/modal";
import { signedBRL } from "../ui/money";

export interface UncategorizedSheetProps {
  state: AppState;
  /** Grava a categoria nos lançamentos de uma vez; rejeita se nada foi gravado. */
  onApply: (ids: Ulid[], categoryId: Ulid) => Promise<number>;
  onClose: () => void;
}

/**
 * Fila do que ficou sem categoria, com seleção múltipla.
 *
 * A sugestão (a mesma da importação de PDF, pelo histórico) só **pré-seleciona**
 * o campo de categoria quando todos os marcados concordam. Nunca é aplicada
 * sozinha: o usuário confirma com "Aplicar categoria".
 */
export function UncategorizedSheet({ state, onApply, onClose }: UncategorizedSheetProps) {
  const items = useMemo(() => uncategorized(listTransactions(state), state), [state]);
  const suggestions = useMemo(() => suggestionsFor(items, state), [items, state]);
  const [picked, setPicked] = useState<ReadonlySet<Ulid>>(new Set());
  const [chosen, setChosen] = useState<Ulid | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const selected = items.filter((item) => picked.has(item.id));
  // Os marcados podem misturar receita e despesa: só vale a categoria que serve
  // aos dois lados (as `both`), senão o app gravaria "Salário" numa despesa.
  const kinds = new Set(selected.map((item) => item.kind));
  const categories = listCategories(state).filter((category) =>
    [...kinds].every((kind) => category.kind === kind || category.kind === "both"),
  );

  const suggested = new Set(selected.map((item) => suggestions.get(item.id) ?? null));
  const common = suggested.size === 1 ? ([...suggested][0] ?? null) : null;
  const value =
    chosen !== null && categories.some((category) => category.id === chosen)
      ? chosen
      : common !== null && categories.some((category) => category.id === common)
        ? common
        : "";

  function toggle(item: Transaction) {
    setProblem(null);
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  async function apply() {
    if (value === "" || selected.length === 0 || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onApply(
        selected.map((item) => item.id),
        value,
      );
      // Quem foi classificado sai da fila sozinho (o `state` muda); só se limpa
      // a seleção e a categoria escolhida.
      setPicked(new Set());
      setChosen(null);
    } catch (cause) {
      // Nada foi gravado (o lote é tudo ou nada): a seleção fica para tentar de novo.
      setProblem(`Nada foi alterado. ${describeError(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  const allPicked = items.length > 0 && selected.length === items.length;

  return (
    <div class="flex flex-col">
      <SheetHeader title="Sem categoria" onClose={onClose} />

      {items.length === 0 ? (
        <div class="mt-6">
          <h3 class="text-lg font-medium">Tudo classificado</h3>
          <p class={HINT}>Nenhum lançamento está sem categoria.</p>
          <div class="mt-5">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      ) : (
        <>
          <div class="mt-4 flex items-center justify-between gap-3">
            <p class="text-sm text-fg/65">
              {items.length} {items.length === 1 ? "lançamento" : "lançamentos"}
            </p>
            <button
              type="button"
              onClick={() =>
                setPicked(allPicked ? new Set() : new Set(items.map((item) => item.id)))
              }
              class="hf-press text-[13px] font-medium text-accent-300"
            >
              {allPicked ? "Desmarcar todos" : "Marcar todos"}
            </button>
          </div>

          <ul class="mt-2 overflow-hidden rounded-lg bg-bg">
            {items.map((item) => {
              const suggestion = suggestions.get(item.id);
              const suggestionName =
                suggestion === undefined ? null : state.categories[suggestion]?.name;
              const income = item.kind === "income";
              return (
                <li key={item.id} class="border-b border-divider last:border-b-0">
                  <label class="flex min-h-14 cursor-pointer items-center gap-3 px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      checked={picked.has(item.id)}
                      onChange={() => toggle(item)}
                      aria-label={`Selecionar ${item.description}`}
                      class="size-5 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[15px] font-medium">{item.description}</span>
                      <span class="mt-0.5 block truncate text-xs text-fg/55">
                        {dayMonth(item.occurredOn)}
                        {suggestionName != null && ` · sugestão: ${suggestionName}`}
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

          <div class="mt-5">
            <label class={LABEL} for="uncategorized-category">
              Categoria para os marcados
            </label>
            <select
              id="uncategorized-category"
              class={`${FIELD_SHEET} mt-2 text-[15px]`}
              value={value}
              disabled={selected.length === 0}
              onChange={(event) => setChosen(event.currentTarget.value || null)}
            >
              <option value="">
                {selected.length === 0 ? "Marque os lançamentos" : "Escolha a categoria"}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {common !== null && value === common && chosen === null && (
              <p class={HINT}>Sugerida pelo seu histórico. Confirme para aplicar.</p>
            )}
          </div>

          {problem !== null && (
            <p role="alert" class="mt-4 text-sm text-expense-fg">
              {problem}
            </p>
          )}

          <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button
              class="flex-1"
              disabled={value === "" || selected.length === 0 || busy}
              onClick={apply}
            >
              Aplicar categoria{selected.length > 0 ? ` (${selected.length})` : ""}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
