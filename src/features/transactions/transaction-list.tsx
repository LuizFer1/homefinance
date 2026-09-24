import { FREQUENCY_LABELS, type RecurrenceFrequency } from "../../domain/events/recurrence";
import { formatBRL } from "../../domain/money/money";
import type { ProjectionState, TransactionRecord } from "../../domain/projections/apply";
import { NEUTRAL_TOKEN } from "../../domain/projections/entities";
import { dayHeading } from "../../domain/projections/periods";
import {
  type DayGroup,
  findCategory,
  findUser,
  groupByDay,
  resolveCategoryName,
  resolvePaymentMethodName,
} from "../../domain/projections/selectors";
import { Icon } from "../icons/icon";
import { MiniAvatar } from "../profile/avatar-view";
import { signedBRL } from "../ui/money";
import { IconTile } from "../ui/tile";

export interface TransactionListProps {
  /** Já filtrados e ordenados por `listTransactions`. */
  items: TransactionRecord[];
  /** Para resolver categoria, forma de pagamento e autor, inclusive os apagados. */
  state: ProjectionState;
  /** Data de hoje em 'YYYY-MM-DD', para os rótulos "Hoje" e "Ontem". */
  today: string;
  onEdit: (record: TransactionRecord) => void;
}

/**
 * Ícone de quem não tem categoria.
 *
 * Cai no eixo receita/despesa em vez de num genérico: é a única coisa que se
 * sabe do lançamento sem categoria.
 */
function fallbackIcon(kind: TransactionRecord["kind"]): string {
  return kind === "income" ? "banknote" : "receipt";
}

function metadata(state: ProjectionState, item: TransactionRecord): string {
  return [
    item.categoryId !== null ? resolveCategoryName(state, item.categoryId) : null,
    item.paymentMethodId !== null ? resolvePaymentMethodName(state, item.paymentMethodId) : null,
    item.cashbackMinor !== null ? `${formatBRL(item.cashbackMinor)} de volta` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

/** Rótulo da tag de recorrente: a frequência da série ("Mensal"). */
function repeatLabel(state: ProjectionState, item: TransactionRecord): string {
  const series = item.recurrenceId === null ? undefined : state.recurrences[item.recurrenceId];
  const frequency = series?.frequency;
  return frequency !== undefined && Object.hasOwn(FREQUENCY_LABELS, frequency)
    ? FREQUENCY_LABELS[frequency as RecurrenceFrequency]
    : "Recorrente";
}

function DayHeading({ group, today }: { group: DayGroup; today: string }) {
  const balance = group.totals.balanceMinor;

  return (
    <div class="flex items-baseline justify-between gap-3 px-1 pt-6 pb-2">
      <h3 class="hf-label">{dayHeading(group.date, today)}</h3>

      {/*
        Subtotal só a partir de dois lançamentos. Num dia de um item ele repetiria
        o valor da linha logo abaixo, palavra por palavra.
      */}
      {group.items.length > 1 && (
        <span
          data-testid="day-total"
          class={`hf-num text-xs font-medium ${balance < 0 ? "text-fg/60" : "text-income-fg"}`}
        >
          {signedBRL(balance, "always")}
        </span>
      )}
    </div>
  );
}

function Row({
  item,
  state,
  first,
  onEdit,
}: {
  item: TransactionRecord;
  state: ProjectionState;
  first: boolean;
  onEdit: (record: TransactionRecord) => void;
}) {
  const category = findCategory(state, item.categoryId);
  const author = findUser(state, item.userId);
  const detail = metadata(state, item);
  const income = item.kind === "income";

  return (
    /*
      Entrada da linha. Sem stagger de propósito: no uso real entra uma linha de
      cada vez, logo depois de o sheet fechar.
    */
    <li class="relative transition-[opacity,translate] duration-200 ease-out-soft starting:-translate-y-1 starting:opacity-0">
      {/* Régua recuada até o texto (tile 38 + gap 12 + padding), esmaecendo à direita. */}
      {!first && <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-[64px]" />}

      {/*
        A linha inteira é o alvo de editar, e excluir mora dentro da edição. A
        lixeira por linha saiu: ao lado do valor, ela dividia vizinhança com o
        número que o usuário veio ler.
      */}
      <button
        type="button"
        aria-label={`Editar ${item.description}`}
        onClick={() => onEdit(item)}
        class="hf-press flex h-16 w-full items-center gap-3 px-3.5 text-left hover:bg-fg/[0.04]"
      >
        {/* Categoria apagada não empresta ícone nem cor: cai no ícone do tipo. */}
        <IconTile
          icon={category?.icon ?? fallbackIcon(item.kind)}
          color={category?.color ?? NEUTRAL_TOKEN}
          size={38}
          iconSize={19}
        />

        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="truncate text-[15px] font-medium">{item.description}</span>
            {item.recurrenceId !== null && (
              <span class="inline-flex shrink-0 items-center gap-1 rounded bg-accent-900 px-1.5 py-0.5 text-[10px] font-medium text-accent-300">
                <Icon name="repeat" size={10} />
                {repeatLabel(state, item)}
              </span>
            )}
          </span>
          {/*
            Autoria como mini-avatar na meta, nunca fundo: fundo colorido
            competiria com o único dado que importa nesta tela — o dinheiro.
            Sem categoria nem forma, a meta fica só com o autor; um "Sem
            categoria · Sem forma" em toda linha seria ruído constante.
          */}
          <span class="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-fg/55">
            <MiniAvatar name={author?.name ?? "?"} color={author?.color ?? NEUTRAL_TOKEN} />
            {detail !== "" && <span class="truncate">{detail}</span>}
          </span>
        </span>

        {/* Verde só na receita: num diário de gastos a despesa é a regra. */}
        <span
          class={`hf-num shrink-0 text-right text-[15px] font-medium ${income ? "text-income-fg" : "text-fg"}`}
        >
          {signedBRL(income ? item.amountMinor : -item.amountMinor, "always")}
        </span>
      </button>
    </li>
  );
}

/** Três linhas-fantasma tracejadas que prenunciam a lista (1 / .55 / .25). */
function GhostRows() {
  return (
    <div aria-hidden="true" class="space-y-2">
      {[1, 0.55, 0.25].map((opacity) => (
        <div
          key={opacity}
          style={{ opacity }}
          class="flex h-16 items-center gap-3 rounded-lg border border-dashed border-neutral-800 px-3.5"
        >
          <span class="size-[38px] rounded-lg border border-dashed border-neutral-700" />
          <span class="flex-1 space-y-2">
            <span class="block h-2.5 w-2/5 rounded-sm bg-neutral-800" />
            <span class="block h-2 w-1/4 rounded-sm bg-neutral-800/70" />
          </span>
          <span class="h-2.5 w-14 rounded-sm bg-neutral-800" />
        </div>
      ))}
    </div>
  );
}

export function TransactionList({ items, state, today, onEdit }: TransactionListProps) {
  if (items.length === 0) {
    // Estado vazio tipográfico: o esqueleto mostra onde a lista vai aparecer,
    // em vez de uma ilustração genérica que não diz nada sobre esta tela.
    return (
      <section aria-label="Lançamentos" class="mt-7">
        <GhostRows />
        <h2 class="mt-7 text-xl font-medium">Nenhum lançamento ainda</h2>
        <p class="mt-2 max-w-[20rem] text-sm leading-normal text-fg/62 text-pretty">
          Registre a primeira despesa ou receita pelos botões acima. Ela aparece aqui, agrupada por
          dia.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Lançamentos" class="mt-1">
      {groupByDay(items).map((group) => (
        <div key={group.date}>
          <DayHeading group={group} today={today} />
          <ul class="overflow-hidden rounded-lg bg-surface">
            {group.items.map((item, index) => (
              <Row key={item.id} item={item} state={state} first={index === 0} onEdit={onEdit} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
