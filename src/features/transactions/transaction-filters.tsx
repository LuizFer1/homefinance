import { useState } from "preact/hooks";
import { isCreditCard } from "../../domain/cards/card";
import type { AppState } from "../../domain/model/app-state";
import type { Transaction } from "../../domain/model/transaction";
import {
  hasFilters,
  NO_FILTERS,
  NONE,
  type TransactionFilters,
} from "../../domain/projections/filter";
import {
  findUser,
  listCategories,
  listPaymentMethods,
  resolveCategoryName,
  resolvePaymentMethodName,
  totals,
} from "../../domain/projections/selectors";
import { Icon } from "../icons/icon";
import { Button } from "../ui/button";
import { LABEL } from "../ui/field";
import { Modal, SheetHeader } from "../ui/modal";
import { brl, MINUS } from "../ui/money";
import { Progress } from "../ui/progress";
import { Segmented } from "../ui/segmented";
import { useSwipeNav } from "../ui/use-swipe-nav";
import { CategoryTile, MethodRow } from "./choice-tiles";

type KindChoice = "all" | "expense" | "income";

const KIND_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "expense", label: "Despesas" },
  { value: "income", label: "Receitas" },
] as const;

/** Chips do recorte ativo, na ordem em que o usuário pensa neles. */
function chipsOf(
  filters: TransactionFilters,
  state: AppState,
): { key: keyof TransactionFilters; label: string }[] {
  const chips: { key: keyof TransactionFilters; label: string }[] = [];
  if (filters.kind !== null) {
    chips.push({ key: "kind", label: filters.kind === "income" ? "Receitas" : "Despesas" });
  }
  if (filters.categoryId !== null) {
    chips.push({
      key: "categoryId",
      label:
        filters.categoryId === NONE
          ? "Sem categoria"
          : resolveCategoryName(state, filters.categoryId),
    });
  }
  if (filters.paymentMethodId !== null) {
    chips.push({
      key: "paymentMethodId",
      label:
        filters.paymentMethodId === NONE
          ? "Sem forma de pagamento"
          : resolvePaymentMethodName(state, filters.paymentMethodId),
    });
  }
  if (filters.userId !== null) {
    chips.push({ key: "userId", label: findUser(state, filters.userId)?.name ?? "Autor removido" });
  }
  return chips;
}

function activeCount(filters: TransactionFilters): number {
  return (
    Number(filters.kind !== null) +
    Number(filters.categoryId !== null) +
    Number(filters.paymentMethodId !== null) +
    Number(filters.userId !== null)
  );
}

const STEPS = ["Tipo", "Categoria", "Pagamento"] as const;
type Step = (typeof STEPS)[number];

export interface FilterSheetProps {
  state: AppState;
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  onClose: () => void;
}

/**
 * Folha de filtros em três etapas (Tipo, Categoria, Pagamento), com setas, barra de
 * progresso e arraste lateral. Edita um rascunho: o recorte só muda em "Filtrar".
 */
export function FilterSheet({ state, filters, onChange, onClose }: FilterSheetProps) {
  const [draft, setDraft] = useState(filters);
  const [step, setStep] = useState<Step>("Tipo");
  const [dir, setDir] = useState<"next" | "back">("next");

  const users = Object.values(state.users).filter((user) => user.deletedAt === null);
  const index = STEPS.indexOf(step);

  function goTo(next: Step) {
    setDir(STEPS.indexOf(next) < index ? "back" : "next");
    setStep(next);
  }

  const swipe = useSwipeNav({ screens: STEPS, screen: step, enabled: true, onChange: goTo });
  // O arraste do app inteiro mora no <main>, que contém este sheet: sem parar a
  // propagação, arrastar o filtro trocaria de aba por baixo do modal.
  const stop = (handler: (event: PointerEvent) => void) => (event: PointerEvent) => {
    event.stopPropagation();
    handler(event);
  };

  // Sem recorte por tipo aqui: uma categoria já escolhida não pode sumir da grade.
  const categories = listCategories(state);
  const methods = listPaymentMethods(state);
  const kind: KindChoice = draft.kind ?? "all";

  return (
    <div class="flex flex-col">
      <SheetHeader title="Filtros" onClose={onClose} />

      <div class="mt-5">
        <Progress
          steps={STEPS}
          current={index}
          maxReachable={STEPS.length - 1}
          onGo={(i) => goTo(STEPS[i] ?? step)}
        />
      </div>

      <div class="mt-4 flex items-center justify-between">
        <h3 class={LABEL}>{index === 2 ? "Forma de pagamento" : step}</h3>
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
          {step === "Tipo" && (
            <>
              <fieldset>
                <legend class="sr-only">Tipo</legend>
                <Segmented
                  name="filter-kind"
                  legend="Tipo"
                  variant="pill"
                  class="mt-2"
                  options={KIND_OPTIONS}
                  value={kind}
                  onChange={(value) => setDraft({ ...draft, kind: value === "all" ? null : value })}
                />
              </fieldset>

              {users.length > 1 && (
                <fieldset class="mt-5">
                  <legend class={LABEL}>Autor</legend>
                  <Segmented
                    name="filter-author"
                    legend="Autor"
                    variant="pill"
                    class="mt-2"
                    options={[
                      { value: "", label: "Todos" },
                      ...users.map((user) => ({ value: user.id, label: user.name })),
                    ]}
                    value={draft.userId ?? ""}
                    onChange={(value) =>
                      setDraft({ ...draft, userId: value === "" ? null : value })
                    }
                  />
                </fieldset>
              )}
            </>
          )}

          {step === "Categoria" && (
            <fieldset>
              <legend class="sr-only">Categoria</legend>
              <div class="mt-2 grid grid-cols-3 gap-2">
                <CategoryTile
                  group="filter-category"
                  name="Todas"
                  icon="tag"
                  color={null}
                  checked={draft.categoryId === null}
                  onSelect={() => setDraft({ ...draft, categoryId: null })}
                />
                <CategoryTile
                  group="filter-category"
                  name="Sem categoria"
                  icon="prohibit"
                  color={null}
                  checked={draft.categoryId === NONE}
                  onSelect={() => setDraft({ ...draft, categoryId: NONE })}
                />
                {categories.map((category) => (
                  <CategoryTile
                    key={category.id}
                    group="filter-category"
                    name={category.name}
                    icon={category.icon}
                    color={category.color}
                    checked={draft.categoryId === category.id}
                    onSelect={() => setDraft({ ...draft, categoryId: category.id })}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {step === "Pagamento" && (
            <fieldset>
              <legend class="sr-only">Forma de pagamento</legend>
              <div class="mt-2 overflow-hidden rounded-lg bg-bg">
                <MethodRow
                  first
                  group="filter-payment"
                  name="Todas"
                  icon="wallet"
                  color={null}
                  checked={draft.paymentMethodId === null}
                  onSelect={() => setDraft({ ...draft, paymentMethodId: null })}
                />
                <MethodRow
                  group="filter-payment"
                  name="Sem forma de pagamento"
                  icon="prohibit"
                  color={null}
                  checked={draft.paymentMethodId === NONE}
                  onSelect={() => setDraft({ ...draft, paymentMethodId: NONE })}
                />
                {methods.map((method) => (
                  <MethodRow
                    key={method.id}
                    group="filter-payment"
                    name={method.name}
                    icon={method.icon}
                    color={method.color}
                    credit={isCreditCard(method)}
                    checked={draft.paymentMethodId === method.id}
                    onSelect={() => setDraft({ ...draft, paymentMethodId: method.id })}
                  />
                ))}
              </div>
            </fieldset>
          )}
        </div>
      </div>

      <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
        <Button
          variant="secondary"
          onClick={() => setDraft({ ...NO_FILTERS, query: filters.query })}
          disabled={activeCount(draft) === 0}
        >
          Limpar
        </Button>
        <Button
          class="flex-1"
          icon="funnel"
          iconSide="left"
          onClick={() => {
            onChange(draft);
            onClose();
          }}
        >
          Filtrar
        </Button>
      </div>
    </div>
  );
}

export interface FilterBarProps {
  state: AppState;
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  sheetOpen: boolean;
  onSheetOpen: (open: boolean) => void;
}

/** Busca, botão de filtros e os chips do recorte ativo. */
export function FilterBar({ state, filters, onChange, sheetOpen, onSheetOpen }: FilterBarProps) {
  const chips = chipsOf(filters, state);
  const count = activeCount(filters);

  return (
    <section aria-label="Busca e filtros" class="mt-4">
      <div class="flex gap-2">
        <div class="relative min-w-0 flex-1">
          <Icon
            name="magnifying-glass"
            size={16}
            class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg/50"
          />
          <input
            type="search"
            aria-label="Buscar lançamentos"
            placeholder="Buscar lançamentos"
            autocomplete="off"
            class="h-11 w-full rounded-lg border border-divider bg-surface pr-3 pl-10 text-[15px] text-fg outline-none placeholder:text-fg/40 focus:border-accent"
            value={filters.query}
            onInput={(event) => onChange({ ...filters, query: event.currentTarget.value })}
          />
        </div>
        <button
          type="button"
          aria-label={count > 0 ? `Filtros (${count} ativos)` : "Filtros"}
          onClick={() => onSheetOpen(true)}
          class={`hf-press relative grid size-11 shrink-0 place-items-center rounded-lg border ${
            count > 0
              ? "border-accent bg-accent-900 text-accent-200"
              : "border-divider text-fg/75 hover:bg-fg/[0.05]"
          }`}
        >
          <Icon name="sliders-horizontal" size={18} />
          {count > 0 && (
            <span
              aria-hidden="true"
              class="hf-num absolute -top-1.5 -right-1.5 grid size-[18px] place-items-center rounded-full bg-accent text-[10px] font-medium text-bg"
            >
              {count}
            </span>
          )}
        </button>
      </div>

      {hasFilters(filters) && (
        <ul class="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                aria-label={`Remover filtro ${chip.label}`}
                onClick={() => onChange({ ...filters, [chip.key]: null })}
                class="hf-press inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent bg-accent-900 pr-2 pl-3 text-[13px] text-accent-200"
              >
                {chip.label}
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => onChange(NO_FILTERS)}
              class="hf-press h-8 px-2 text-[13px] font-medium text-accent-300"
            >
              Limpar
            </button>
          </li>
        </ul>
      )}

      <Modal open={sheetOpen} title="Filtros" onClose={() => onSheetOpen(false)}>
        {sheetOpen && (
          <FilterSheet
            state={state}
            filters={filters}
            onChange={onChange}
            onClose={() => onSheetOpen(false)}
          />
        )}
      </Modal>
    </section>
  );
}

/**
 * Totais do recorte. Rotulado "Saldo do filtro" de propósito: logo acima mora o
 * "Saldo total", e dois números chamados saldo sem dizer o recorte seriam um bug
 * de leitura.
 */
export function FilterSummary({ items }: { items: Transaction[] }) {
  const sum = totals(items);

  return (
    <section aria-label="Resultado do filtro" class="mt-4 rounded-lg bg-surface p-4">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="hf-label">Saldo do filtro</h2>
        <span class="text-xs text-fg/55">
          {items.length} {items.length === 1 ? "lançamento" : "lançamentos"}
        </span>
      </div>
      <p
        data-testid="filter-balance"
        class={`hf-num mt-1.5 text-2xl font-medium ${sum.balanceMinor < 0 ? "text-expense-fg" : ""}`}
      >
        {sum.balanceMinor < 0 ? MINUS : ""}
        {brl(Math.abs(sum.balanceMinor))}
      </p>
      <p class="hf-num mt-2 flex gap-3 text-[13px] font-medium">
        <span class="text-income-fg">
          <span class="sr-only">Receitas </span>+{brl(sum.incomeMinor)}
        </span>
        <span class="text-expense-fg">
          <span class="sr-only">Despesas </span>
          {MINUS}
          {brl(sum.expenseMinor)}
        </span>
      </p>
    </section>
  );
}

/** Recorte sem resultado: não é "nenhum lançamento ainda", e o botão desfaz o recorte. */
export function NothingFound({ onClear }: { onClear: () => void }) {
  return (
    <section aria-label="Nada encontrado" class="mt-7">
      <h2 class="text-xl font-medium">Nada encontrado</h2>
      <p class="mt-2 max-w-[20rem] text-sm leading-normal text-fg/62 text-pretty">
        Nenhum lançamento bate com a busca e os filtros. Tente outro termo ou limpe o recorte.
      </p>
      <div class="mt-4">
        <Button variant="secondary" onClick={onClear}>
          Limpar busca e filtros
        </Button>
      </div>
    </section>
  );
}
