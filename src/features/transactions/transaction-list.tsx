import type { Ulid } from "../../domain/ids/ulid";
import { formatBRL } from "../../domain/money/money";
import type { ProjectionState, TransactionRecord } from "../../domain/projections/apply";
import { dayLabel } from "../../domain/projections/periods";
import {
  type DayGroup,
  findCategory,
  groupByDay,
  resolveAuthorColor,
  resolveCategoryName,
  resolvePaymentMethodName,
} from "../../domain/projections/selectors";
import { cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";

export interface TransactionListProps {
  /** Já filtrados e ordenados por `listTransactions`. */
  items: TransactionRecord[];
  /** Para resolver categoria, forma de pagamento e autor, inclusive os apagados. */
  state: ProjectionState;
  /** Data de hoje em 'YYYY-MM-DD', para os rótulos "Hoje" e "Ontem". */
  today: string;
  onEdit: (record: TransactionRecord) => void;
  onDelete: (entityId: Ulid) => void;
}

/**
 * Ícone de quem não tem categoria.
 *
 * Cai no eixo receita/despesa em vez de num genérico: é a única coisa que se
 * sabe do lançamento sem categoria, e são os mesmos dois ícones que a fila de
 * ações rápidas já usa para criar cada tipo.
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

function signed(item: TransactionRecord): string {
  return `${item.kind === "income" ? "+" : "-"}${formatBRL(item.amountMinor)}`;
}

const CAPTION = "hf-caption text-[0.6875rem] font-semibold uppercase text-base-content/45";

function DayHeading({ group, today }: { group: DayGroup; today: string }) {
  const negative = group.totals.balanceMinor < 0;

  return (
    <div class="flex items-baseline justify-between gap-3 px-1 pt-5 pb-1.5">
      <h3 class={CAPTION}>{dayLabel(group.date, today)}</h3>

      {/*
        Subtotal só a partir de dois lançamentos. Num dia de um item ele repetiria
        o valor da linha logo abaixo, palavra por palavra, e um número duplicado
        na tela do dinheiro é pior que número nenhum.
      */}
      {group.items.length > 1 && (
        <span
          data-testid="day-total"
          class={`hf-num text-xs font-medium tabular-nums ${
            negative ? "text-base-content/45" : "text-success"
          }`}
        >
          {negative ? "" : "+"}
          {formatBRL(group.totals.balanceMinor)}
        </span>
      )}
    </div>
  );
}

function Row({
  item,
  state,
  onEdit,
  onDelete,
}: {
  item: TransactionRecord;
  state: ProjectionState;
  onEdit: (record: TransactionRecord) => void;
  onDelete: (entityId: Ulid) => void;
}) {
  const category = findCategory(state, item.categoryId);
  const tint = cssVarForToken(category?.color ?? "slate");
  const detail = metadata(state, item);

  return (
    <li class="relative flex items-stretch">
      {/*
        Autoria como marca lateral, nunca fundo: fundo colorido competiria com o
        único dado que importa nesta tela — o dinheiro. A foto do autor não entra
        aqui pelo mesmo motivo, mais o de que 96px renderizados a 20px viram
        ruído cinza que se repete idêntico em toda linha enquanto houver um
        perfil só.

        Pílula recuada, e não faixa sangrando até a borda: a lista tem raio de
        1rem, e uma faixa em esquadro contra o canto arredondado lê como defeito
        no primeiro e no último item.
      */}
      <span
        data-testid="author-mark"
        aria-hidden="true"
        class="absolute inset-y-2.5 left-1.5 w-1 rounded-full"
        style={{ backgroundColor: cssVarForToken(resolveAuthorColor(state, item.userId)) }}
      />

      {/*
        A linha inteira é o alvo de editar. Dois botões de texto por linha comiam
        a largura da descrição num celular e davam ao destrutivo o mesmo peso
        visual do inócuo.
      */}
      <button
        type="button"
        aria-label={`Editar ${item.description}`}
        onClick={() => onEdit(item)}
        class="hf-press flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-1 pl-4 text-left
          transition-colors duration-150 hover:bg-base-200/60"
      >
        {/*
          Âncora visual da linha. A cor é da categoria — token de paleta fechada,
          resolvido no CSS —, e o disco entra como tinta fraca dela em vez de
          preenchimento chapado: sólido, doze discos saturados numa tela
          disputariam com os valores.
        */}
        <span
          aria-hidden="true"
          class="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `color-mix(in oklab, ${tint} 15%, transparent)`, color: tint }}
        >
          <Icon name={category?.icon ?? fallbackIcon(item.kind)} size={17} />
        </span>

        <span class="min-w-0 flex-1">
          <span class="block truncate">{item.description}</span>
          {/*
            Segunda linha só quando há o que dizer. Um "Sem categoria · Sem forma
            de pagamento" em toda linha viraria ruído constante e empurraria o
            valor, que é o dado que importa. A data saiu daqui: ela agora é o
            cabeçalho do grupo, e repeti-la por linha era a repetição mais cara
            da tela.
          */}
          {detail !== "" && (
            <span class="mt-0.5 block truncate text-xs text-base-content/45">{detail}</span>
          )}
        </span>

        {/*
          Coluna de largura mínima e alinhada à direita: sem isso o valor empurra
          o resto e cada linha para num lugar diferente.
          Verde só na receita — num diário de gastos a despesa é a regra, e
          pintar a regra de vermelho vira ruído em vez de sinal.
        */}
        <span
          class={`hf-num shrink-0 text-right font-semibold tabular-nums ${
            item.kind === "income" ? "text-success" : "text-base-content"
          }`}
        >
          {signed(item)}
        </span>
      </button>

      {/*
        Peso baixo e afastado do valor: o destrutivo não pode dividir vizinhança
        visual com o número que o usuário veio ler. Só ganha contraste no hover,
        quando a intenção já é dele.
      */}
      <button
        type="button"
        aria-label={`Excluir ${item.description}`}
        onClick={() => onDelete(item.id)}
        class="hf-press flex w-10 shrink-0 items-center justify-center text-base-content/20
          transition-colors duration-150 hover:text-error"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        >
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
        </svg>
      </button>
    </li>
  );
}

export function TransactionList({ items, state, today, onEdit, onDelete }: TransactionListProps) {
  if (items.length === 0) {
    return (
      <p class="rounded-box mt-4 border border-base-content/10 bg-base-100/60 px-4 py-10 text-center text-sm text-base-content/45">
        Nenhum lançamento ainda.
      </p>
    );
  }

  return (
    <section aria-label="Lançamentos">
      {groupByDay(items).map((group) => (
        <div key={group.date}>
          <DayHeading group={group} today={today} />

          <ul class="rounded-box divide-y divide-base-300 border border-base-content/10 bg-base-100/60">
            {group.items.map((item) => (
              <Row key={item.id} item={item} state={state} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
