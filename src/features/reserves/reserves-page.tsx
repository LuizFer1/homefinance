import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import type { EmergencyMultiple, Reserve, ReserveKind } from "../../domain/model/reserve";
import { formatBRL } from "../../domain/money/money";
import { monthLabelLong, monthOf } from "../../domain/projections/periods";
import {
  emergencyOf,
  isDuplicateEmergency,
  listReserves,
  reserveBalance,
  savedInMonth,
} from "../../domain/reserves/balances";
import {
  emergencyTarget,
  essentialCost,
  findEssentialCategoryIds,
} from "../../domain/reserves/essential";
import { formatMonths, monthsCovered } from "../../domain/reserves/goals";
import { cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";
import { Money, wholeBRL } from "../ui/money";
import { PageHeader } from "../ui/page-header";
import { IconTile } from "../ui/tile";
import { AccentIconBox } from "./accent-icon-box";
import { EmptyState } from "./empty-state";
import { deadlineLabel } from "./format";
import { MonthsMeter } from "./months-meter";

export interface ReservesPageProps {
  state: AppState;
  today: string;
  onOpen: (id: Ulid) => void;
  onNew: (kind: ReserveKind) => void;
  /** Estado vazio: cria a emergência direto com o múltiplo escolhido (e o custo manual, se houver). */
  onCreateEmergency: (multiple: EmergencyMultiple, essentialOverrideMinor: number | null) => void;
}

interface RowProps {
  state: AppState;
  reserve: Reserve;
  today: string;
  onOpen: (id: Ulid) => void;
}

function EmergencyCard({ state, reserve, today, onOpen }: RowProps) {
  const goal = emergencyTarget(state, reserve, today);
  const balance = reserveBalance(state, reserve.id);
  const covered = goal === null ? 0 : monthsCovered(balance, goal.costMinor);

  return (
    <button
      type="button"
      onClick={() => onOpen(reserve.id)}
      class="hf-press mt-[18px] block w-full rounded-lg bg-surface p-4 text-left shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-accent)_28%,transparent)]"
    >
      <span class="flex items-center gap-3">
        <AccentIconBox size={36} />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[15px] font-medium">{reserve.name}</span>
          <span class="block text-xs text-fg/55">
            Meta: {reserve.multiple ?? 6} meses do custo essencial
          </span>
        </span>
        <span class="text-fg/45">
          <Icon name="caret-right" size={16} />
        </span>
      </span>
      <span class="mt-3.5 flex items-baseline justify-between gap-3">
        <Money minor={balance} size={28} />
        <span class="hf-num text-[13px] text-fg/55">
          {goal === null ? "Defina o custo essencial" : `de ${wholeBRL(goal.targetMinor)}`}
        </span>
      </span>
      {goal !== null && (
        <>
          <span class="mt-2.5 block">
            <MonthsMeter months={covered} height={8} />
          </span>
          <span class="mt-2 flex justify-between gap-3 text-xs">
            {balance >= goal.targetMinor ? (
              <span class="font-medium text-accent-300">Meta atingida</span>
            ) : (
              <>
                <span class="font-medium text-accent-300">Cobre {formatMonths(covered)} meses</span>
                <span class="hf-num text-fg/55">faltam {wholeBRL(goal.targetMinor - balance)}</span>
              </>
            )}
          </span>
        </>
      )}
    </button>
  );
}

function metaLine(state: AppState, r: Reserve, today: string, balance: number): string {
  if (isDuplicateEmergency(state, r)) {
    return "Reserva de emergência duplicada (criada em outro aparelho)";
  }
  if (r.targetMinor === null) return "Sem meta";
  if (balance >= r.targetMinor) return "Meta atingida";
  const parts = [`Faltam ${wholeBRL(r.targetMinor - balance)}`];
  if (r.deadline !== null) parts.push(`até ${deadlineLabel(r.deadline, today)}`);
  return parts.join(" · ");
}

function PotRow({ state, reserve, today, onOpen, first }: RowProps & { first: boolean }) {
  const balance = reserveBalance(state, reserve.id);
  const target = reserve.targetMinor;
  const fraction = target === null || target <= 0 ? 0 : Math.min(1, Math.max(0, balance / target));

  return (
    <li class="relative">
      {!first && <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-[50px]" />}
      <button
        type="button"
        onClick={() => onOpen(reserve.id)}
        class="hf-press flex w-full items-center gap-3 py-3 text-left"
      >
        <IconTile icon={reserve.icon} color={reserve.color} size={38} iconSize={20} />
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline justify-between gap-3">
            <span class="truncate text-[15px] font-medium">{reserve.name}</span>
            <span class="hf-num text-[15px] font-medium">{formatBRL(balance)}</span>
          </span>
          <span class="mt-0.5 block text-xs text-fg/55">
            {metaLine(state, reserve, today, balance)}
          </span>
          {target !== null && (
            <span
              aria-hidden="true"
              class="mt-2 block h-1 overflow-hidden rounded-full bg-neutral-900"
            >
              <span
                class="block h-full rounded-full"
                style={{
                  width: `${Math.round(fraction * 100)}%`,
                  background: cssVarForToken(reserve.color),
                }}
              />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Aba Reservas (2a); sem nenhuma reserva viva, mostra o estado vazio (2f). */
export function ReservesPage({
  state,
  today,
  onOpen,
  onNew,
  onCreateEmergency,
}: ReservesPageProps) {
  const emergency = emergencyOf(state);
  // `listReserves` traz a emergência na frente; as caixinhas são o resto.
  const all = listReserves(state);
  const pots = all.filter((r) => r.id !== emergency?.id);
  const month = monthOf(today);
  const saved = savedInMonth(state, month);
  const isEmpty = emergency === null && pots.length === 0;

  const total = all.reduce((sum, r) => sum + reserveBalance(state, r.id), 0);
  // Custo 0 (histórico só fora das categorias essenciais) não serve de meta: cai no campo manual.
  const cost = essentialCost(state, findEssentialCategoryIds(state), today);
  const usableCost = cost !== null && cost > 0 ? cost : null;
  const monthName = monthLabelLong(month).split(" ")[0]?.toLocaleLowerCase("pt-BR") ?? "";

  return (
    <>
      <PageHeader
        title="Reservas"
        action={
          !isEmpty ? (
            <button
              type="button"
              onClick={() => onNew("goal")}
              class="hf-press flex h-[38px] items-center gap-1.5 rounded-lg border border-accent px-3.5 text-sm font-medium text-accent-300"
            >
              <Icon name="plus" size={16} />
              Nova
            </button>
          ) : undefined
        }
      />

      {isEmpty ? (
        <EmptyState
          // Sem emergência não há categorias gravadas: vale o conjunto essencial padrão.
          costMinor={usableCost}
          onCreateEmergency={onCreateEmergency}
          onCreateGoal={() => onNew("goal")}
        />
      ) : (
        <>
          <h2 class="hf-label mt-[18px]">Total separado</h2>
          <p class="mt-1">
            <Money minor={total} size={44} testId="reserves-total" />
          </p>
          {saved !== 0 && (
            <p class="mt-1 flex items-center gap-1.5 text-[13px] text-fg/65">
              <Icon name={saved > 0 ? "arrow-down" : "arrow-up"} size={14} />
              <span class="hf-num">
                {formatBRL(Math.abs(saved))} {saved > 0 ? "guardados" : "retirados"} em {monthName}
              </span>
            </p>
          )}

          {emergency !== null && (
            <EmergencyCard state={state} reserve={emergency} today={today} onOpen={onOpen} />
          )}

          {pots.length > 0 && (
            <>
              <div class="mt-[22px] mb-2 flex items-baseline justify-between">
                <h2 class="hf-label">Caixinhas</h2>
                <span class="hf-num text-xs text-fg/55">{pots.length}</span>
              </div>
              <ul class="rounded-lg bg-surface px-3.5">
                {pots.map((r, index) => (
                  <PotRow
                    key={r.id}
                    state={state}
                    reserve={r}
                    today={today}
                    onOpen={onOpen}
                    first={index === 0}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}
