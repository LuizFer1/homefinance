import { useState } from "preact/hooks";
import { budgetOf } from "../../domain/budgets/list";
import {
  type BudgetStatus,
  budgetReport,
  levelOf,
  type UnbudgetedSpend,
} from "../../domain/budgets/status";
import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import type { Transaction } from "../../domain/model/transaction";
import { digitsOf, maskDigits, minorOf } from "../../domain/money/mask";
import { monthOf } from "../../domain/projections/periods";
import { listCategoriesFor } from "../../domain/projections/selectors";
import { Icon } from "../icons/icon";
import { ignoreHandled } from "../session/session";
import { CategoryTile } from "../transactions/choice-tiles";
import { BudgetBar } from "../ui/budget-bar";
import { Button } from "../ui/button";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { Modal, SheetHeader } from "../ui/modal";
import { brl } from "../ui/money";
import { MonthPicker } from "../ui/month-picker";
import { PageHeader } from "../ui/page-header";
import { Progress } from "../ui/progress";
import { IconTile } from "../ui/tile";
import { useSwipeNav } from "../ui/use-swipe-nav";
import type { BudgetsStore } from "./store";

export interface BudgetsPageProps {
  state: AppState;
  /** Lançamentos visíveis (já sem os apagados). */
  items: Transaction[];
  today: string;
  store: BudgetsStore;
  onBack: () => void;
}

/** `categoryId` nulo = meta nova, com a categoria a escolher no sheet. */
interface SheetTarget {
  categoryId: Ulid | null;
}

function countLabel(count: number): string {
  return count === 1 ? "1 lançamento" : `${count} lançamentos`;
}

function BudgetRow({ row, onEdit }: { row: BudgetStatus; onEdit: () => void }) {
  const { category } = row;
  const over = row.level === "over";

  return (
    <li class="rounded-lg bg-surface p-4">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar meta de ${category.name}`}
        class="hf-press flex w-full items-center gap-3 text-left"
      >
        <IconTile icon={category.icon} color={category.color} size={36} iconSize={18} />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[15px] font-medium">{category.name}</span>
          <span class="hf-num mt-0.5 block truncate text-xs text-fg/60">
            {brl(row.spentMinor)} de {brl(row.limitMinor)}
          </span>
        </span>
        <span
          class={`hf-num shrink-0 text-sm font-medium ${over ? "text-expense-fg" : "text-fg/75"}`}
        >
          {Math.floor(row.usedRatio * 100)}%
        </span>
      </button>

      <div class="mt-3">
        <BudgetBar ratio={row.usedRatio} level={row.level} label={`Meta de ${category.name}`} />
      </div>

      <p class={`hf-num mt-2 text-xs ${over ? "font-medium text-expense-fg" : "text-fg/60"}`}>
        {over ? `Passou ${brl(row.overMinor)} da meta` : `Restam ${brl(row.remainingMinor)}`}
        <span class="text-fg/45"> · {countLabel(row.count)}</span>
      </p>
    </li>
  );
}

function UnbudgetedRow({ spend, onDefine }: { spend: UnbudgetedSpend; onDefine: () => void }) {
  const { category } = spend;
  const name = category?.name ?? "Sem categoria";

  return (
    <li class="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <IconTile
        icon={category?.icon ?? "prohibit"}
        color={category?.color ?? null}
        size={36}
        iconSize={18}
      />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[15px]">{name}</span>
        <span class="hf-num mt-0.5 block truncate text-xs text-fg/60">
          {brl(spend.spentMinor)} · {countLabel(spend.count)}
        </span>
      </span>
      {/* "Sem categoria" não é uma categoria: não tem como ter meta. */}
      {category !== null && (
        <button
          type="button"
          onClick={onDefine}
          aria-label={`Definir meta para ${name}`}
          class="hf-press shrink-0 text-[13px] font-medium text-accent-300"
        >
          Definir meta
        </button>
      )}
    </li>
  );
}

const STEPS = ["Categoria", "Limite", "Prévia"] as const;
type Step = (typeof STEPS)[number];

interface BudgetSheetProps {
  state: AppState;
  items: Transaction[];
  /** Mês em exibição na página: é contra o gasto dele que a prévia compara o limite. */
  month: string;
  categoryId: Ulid | null;
  onSave: (categoryId: Ulid, limitMinor: number) => void;
  onRemove: (categoryId: Ulid) => void;
  onClose: () => void;
}

/**
 * Cria ou edita a meta de uma categoria em três etapas: categoria, limite e prévia.
 * Só a prévia grava, depois de mostrar o gasto do mês contra o novo limite.
 * Excluir segue o resto do app: segurar a lixeira.
 */
function BudgetSheet({
  state,
  items,
  month,
  categoryId,
  onSave,
  onRemove,
  onClose,
}: BudgetSheetProps) {
  const current = categoryId === null ? null : budgetOf(state, categoryId);
  const [chosen, setChosen] = useState<Ulid | null>(categoryId);
  const [digits, setDigits] = useState(current === null ? "" : String(current.limitMinor));
  // Com a categoria já definida (edição ou convite "Definir meta") a escolha não
  // tem o que decidir: abre direto no limite.
  const [step, setStep] = useState<Step>(categoryId === null ? "Categoria" : "Limite");
  const [dir, setDir] = useState<"next" | "back">("next");

  const editing = current !== null;
  const taken = new Set(
    listCategoriesFor(state, "expense")
      .filter((category) => budgetOf(state, category.id) !== null)
      .map((category) => category.id),
  );
  const choices = listCategoriesFor(state, "expense").filter((category) => !taken.has(category.id));
  const limitMinor = minorOf(digits);
  const category = chosen === null ? null : (state.categories[chosen] ?? null);
  const name = category?.name ?? null;

  // Sem categoria não há limite a digitar; sem limite não há prévia a mostrar.
  const maxReachable = category === null ? 0 : limitMinor > 0 ? 2 : 1;
  const index = STEPS.indexOf(step);

  function goTo(next: Step) {
    const target = Math.min(STEPS.indexOf(next), maxReachable);
    setDir(target < index ? "back" : "next");
    setStep(STEPS[target] ?? step);
  }

  const swipe = useSwipeNav({ screens: STEPS, screen: step, enabled: true, onChange: goTo });
  // O arraste do app inteiro mora no <main>, que contém este sheet: sem parar a
  // propagação, arrastar o formulário trocaria de aba por baixo do modal.
  const stop = (handler: (event: PointerEvent) => void) => (event: PointerEvent) => {
    event.stopPropagation();
    handler(event);
  };

  // O gasto não depende do limite: vem da linha da meta atual ou, sendo meta nova,
  // da lista "sem meta". Usar o mesmo `budgetReport` da página evita discordar dela.
  const report = budgetReport(items, state, month);
  const spentMinor =
    category === null
      ? 0
      : (report.rows.find((row) => row.category.id === category.id)?.spentMinor ??
        report.unbudgeted.find((spend) => spend.category?.id === category.id)?.spentMinor ??
        0);
  const ratio = limitMinor > 0 ? spentMinor / limitMinor : 0;
  const level = levelOf(spentMinor, limitMinor);

  return (
    <div class="flex flex-col">
      <SheetHeader
        title={editing ? `Meta de ${name ?? "categoria"}` : "Nova meta"}
        onClose={onClose}
        actions={
          editing && categoryId !== null ? (
            <HoldToDelete
              label={`Excluir meta de ${name ?? "categoria"}`}
              onConfirm={() => onRemove(categoryId)}
            />
          ) : undefined
        }
      />

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
          {step === "Categoria" &&
            (editing && category !== null ? (
              // Trocar a categoria de uma meta existente seria criar outra: fica travada.
              <fieldset>
                <legend class="sr-only">Categoria</legend>
                <div class="mt-2 grid grid-cols-3 gap-2">
                  <CategoryTile
                    group="budget-category"
                    name={category.name}
                    icon={category.icon}
                    color={category.color}
                    checked
                    onSelect={() => undefined}
                  />
                </div>
                <p class={HINT}>
                  A categoria de uma meta não muda. Exclua e crie outra, se preciso.
                </p>
              </fieldset>
            ) : (
              <fieldset>
                <legend class="sr-only">Categoria</legend>
                {choices.length === 0 ? (
                  <p class="mt-2 rounded-lg bg-bg px-3.5 py-3 text-sm text-fg/60">
                    Toda categoria de despesa já tem meta.
                  </p>
                ) : (
                  <div class="mt-2 grid grid-cols-3 gap-2">
                    {choices.map((choice) => (
                      <CategoryTile
                        key={choice.id}
                        group="budget-category"
                        name={choice.name}
                        icon={choice.icon}
                        color={choice.color}
                        checked={chosen === choice.id}
                        onSelect={() => setChosen(choice.id)}
                      />
                    ))}
                  </div>
                )}
              </fieldset>
            ))}

          {step === "Limite" && (
            <div>
              <label class={LABEL} for="budget-limit">
                Limite por mês
              </label>
              <input
                id="budget-limit"
                type="text"
                inputMode="numeric"
                autocomplete="off"
                placeholder="0,00"
                value={maskDigits(digits)}
                onInput={(event) => setDigits(digitsOf(event.currentTarget))}
                class={`${FIELD_SHEET} hf-num mt-2`}
              />
              <p class={HINT}>Vale todo mês, até você mudar ou excluir.</p>
            </div>
          )}

          {step === "Prévia" && category !== null && (
            <div>
              <div class="flex items-center gap-3 rounded-lg bg-bg px-3.5 py-3">
                <IconTile icon={category.icon} color={category.color} size={30} iconSize={17} />
                <p class="min-w-0 flex-1 truncate text-[15px] font-medium">{category.name}</p>
                <p class="hf-num shrink-0 text-[15px] font-medium">{brl(limitMinor)}</p>
              </div>

              <div class="mt-3 rounded-lg bg-bg px-3.5 py-3">
                <p class="hf-num text-sm text-fg/75">
                  Gasto no mês: {brl(spentMinor)} de {brl(limitMinor)}
                  <span class={level === "over" ? " font-medium text-expense-fg" : ""}>
                    {" "}
                    · {Math.floor(ratio * 100)}%
                  </span>
                </p>
                <div class="mt-2.5">
                  <BudgetBar
                    ratio={ratio}
                    level={level}
                    label={`Prévia da meta de ${category.name}`}
                  />
                </div>
                <p class="hf-num mt-2 text-xs text-fg/60">
                  {level === "over"
                    ? `Passaria ${brl(spentMinor - limitMinor)} da meta`
                    : `Restariam ${brl(limitMinor - spentMinor)}`}
                </p>
              </div>
            </div>
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
        {index < 2 ? (
          <Button
            key="avancar"
            icon="arrow-right"
            class="flex-1"
            disabled={index >= maxReachable}
            onClick={() => goTo(STEPS[index + 1] ?? step)}
          >
            Continuar
          </Button>
        ) : (
          <Button
            key="salvar"
            icon="check"
            iconSide="left"
            class="flex-1"
            disabled={chosen === null || limitMinor <= 0}
            onClick={() => {
              if (chosen !== null && limitMinor > 0) onSave(chosen, limitMinor);
            }}
          >
            Salvar meta
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Orçamento: a meta mensal de cada categoria contra o que já se gastou no mês.
 *
 * Estourar a meta é informação, não erro — a barra passa de 100% e o texto diz
 * quanto passou. Categoria que tem gasto e não tem meta aparece à parte, com o
 * convite para definir uma.
 */
export function BudgetsPage({ state, items, today, store, onBack }: BudgetsPageProps) {
  const current = monthOf(today);
  const [month, setMonth] = useState(current);
  const [target, setTarget] = useState<SheetTarget | null>(null);

  const { rows, unbudgeted } = budgetReport(items, state, month);
  const empty = rows.length === 0 && unbudgeted.length === 0;
  const spent = rows.reduce((sum, row) => sum + row.spentMinor, 0);
  const limit = rows.reduce((sum, row) => sum + row.limitMinor, 0);

  function closeSheet() {
    setTarget(null);
  }

  return (
    <section aria-label="Orçamento">
      <PageHeader
        title="Orçamento"
        onBack={onBack}
        action={
          <button
            type="button"
            onClick={() => setTarget({ categoryId: null })}
            class="hf-press flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-accent
              bg-accent/10 px-3 text-sm font-medium text-accent-300 hover:bg-accent/20"
          >
            <Icon name="plus" size={16} />
            Meta
          </button>
        }
      />

      <div class="mt-4">
        <MonthPicker month={month} current={current} onChange={setMonth} />
      </div>

      {rows.length > 0 && (
        <section aria-label="Total das metas" class="mt-4 rounded-lg bg-surface p-4">
          <h2 class="hf-label">Gasto nas metas</h2>
          <p class="hf-num mt-1.5 text-2xl font-medium">
            {brl(spent)} <span class="text-base text-fg/55">de {brl(limit)}</span>
          </p>
        </section>
      )}

      {empty && (
        <section aria-label="Sem metas" class="mt-7">
          <h2 class="text-xl font-medium">Defina quanto gastar por categoria</h2>
          <p class="mt-2 max-w-[20rem] text-sm leading-normal text-fg/62 text-pretty">
            A meta é um teto mensal: o app mostra quanto já foi, quanto resta e avisa quando chega
            perto. Nada é bloqueado.
          </p>
          <div class="mt-4">
            <Button icon="plus" iconSide="left" onClick={() => setTarget({ categoryId: null })}>
              Definir meta
            </Button>
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <ul aria-label="Metas" class="mt-4 flex flex-col gap-3">
          {rows.map((row) => (
            <BudgetRow
              key={row.budget.id}
              row={row}
              onEdit={() => setTarget({ categoryId: row.category.id })}
            />
          ))}
        </ul>
      )}

      {unbudgeted.length > 0 && (
        <section aria-label="Gastos sem meta" class="mt-6">
          <h2 class="hf-label">Sem meta</h2>
          <ul class="mt-2.5 overflow-hidden rounded-lg bg-surface">
            {unbudgeted.map((spend) => (
              <UnbudgetedRow
                key={spend.category?.id ?? "none"}
                spend={spend}
                onDefine={() => setTarget({ categoryId: spend.category?.id ?? null })}
              />
            ))}
          </ul>
        </section>
      )}

      <Modal open={target !== null} title="Meta" onClose={closeSheet}>
        {target !== null && (
          <BudgetSheet
            // A `key` remonta o formulário ao trocar de categoria: o campo parte do valor dela.
            key={target.categoryId ?? "new"}
            state={state}
            items={items}
            month={month}
            categoryId={target.categoryId}
            onSave={(categoryId, limitMinor) => {
              closeSheet();
              void store.set(categoryId, limitMinor).catch(ignoreHandled);
            }}
            onRemove={(categoryId) => {
              closeSheet();
              void store.remove(categoryId).catch(ignoreHandled);
            }}
            onClose={closeSheet}
          />
        )}
      </Modal>
    </section>
  );
}
