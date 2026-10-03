import { useState } from "preact/hooks";
import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import { isAlive } from "../../domain/model/base";
import type { Reserve, ReserveMovement } from "../../domain/model/reserve";
import { reasonLabel } from "../../domain/model/reserve";
import { findUser, resolveAuthorColor } from "../../domain/projections/selectors";
import { reserveBalance } from "../../domain/reserves/balances";
import { emergencyTarget } from "../../domain/reserves/essential";
import { formatMonths, monthsCovered, projectedCompletion } from "../../domain/reserves/goals";
import { Icon } from "../icons/icon";
import { MiniAvatar } from "../profile/avatar-view";
import { PRIMARY, SECONDARY } from "../ui/button";
import { Money, signedBRL, wholeBRL } from "../ui/money";
import { IconTile } from "../ui/tile";
import { AccentIconBox } from "./accent-icon-box";
import { deadlineLabel, movementDateLabel } from "./format";
import { MonthsMeter } from "./months-meter";

export interface ReserveDetailProps {
  state: AppState;
  reserveId: Ulid;
  today: string;
  onBack: () => void;
  onEdit: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onOpenMovement: (movement: ReserveMovement) => void;
}

/** Quantos movimentos aparecem antes de "Ver todos". */
const COLLAPSED_COUNT = 3;

/** Mais novo primeiro; no mesmo dia o id desempata, senão a ordem mudaria entre aparelhos. */
function movementsOf(state: AppState, reserveId: Ulid): ReserveMovement[] {
  return Object.values(state.reserveMovements)
    .filter((m) => isAlive(m) && m.reserveId === reserveId)
    .sort((a, b) => {
      if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });
}

function movementName(m: ReserveMovement): string {
  if (m.description !== null && m.description !== "") return m.description;
  if (m.recurring) return "Guardado todo mês";
  return m.amountMinor > 0 ? "Guardado" : reasonLabel(m.reason);
}

/**
 * A posição atual (ex.: 3,9) fica sob o segmento parcialmente cheio, que é o
 * (inteiro + 1)-ésimo: em 3,9 o quarto segmento está a 90% e leva o "3,9" no
 * lugar do "4". Cada rótulo é uma célula da mesma grade do medidor, para ficar
 * alinhado ao segmento; "meses" fecha a última. Decorativo: o `sr-only` ao lado
 * diz a cobertura por extenso.
 */
function MeterLabels({ months, multiple }: { months: number; multiple: number }) {
  const slot = Math.min(6, Math.floor(months) + 1);
  return (
    <>
      <span class="sr-only">
        Cobre {formatMonths(months)} meses de {multiple}
      </span>
      <div
        aria-hidden="true"
        class="mt-1.5 grid grid-cols-6 gap-1 text-[11px] whitespace-nowrap text-fg/50"
      >
        {[1, 2, 3, 4, 5, 6].map((n) => {
          const label = n === slot ? formatMonths(months) : String(n);
          return (
            <span key={n} class={`hf-num ${n === slot ? "font-medium text-accent-300" : ""}`}>
              {n === 6 ? `${label} meses` : label}
            </span>
          );
        })}
      </div>
    </>
  );
}

interface InfoRowProps {
  /** Só a primeira linha não leva régua em cima. */
  first: boolean;
  icon: string;
  title: string;
  sub?: string;
  value?: string;
}

function InfoRow({ first, icon, title, sub, value }: InfoRowProps) {
  return (
    <li class="relative flex items-start gap-3 py-3.5">
      {!first && <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-11" />}
      <IconTile icon={icon} color={null} size={32} iconSize={17} />
      <span class="min-w-0 flex-1">
        <span class="block text-sm">{title}</span>
        {sub !== undefined && (
          <span class="mt-0.5 block text-xs leading-[1.45] text-fg/55 text-pretty">{sub}</span>
        )}
      </span>
      {value !== undefined && <span class="hf-num flex-none text-sm font-medium">{value}</span>}
    </li>
  );
}

interface MovementRowProps {
  state: AppState;
  movement: ReserveMovement;
  first: boolean;
  onOpen: (movement: ReserveMovement) => void;
}

function MovementRow({ state, movement, first, onOpen }: MovementRowProps) {
  const out = movement.amountMinor < 0;
  const author = findUser(state, movement.userId);
  const date = movementDateLabel(movement.occurredOn);

  return (
    <li class="relative">
      {!first && <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-[50px]" />}
      <button
        type="button"
        data-testid="movement-row"
        onClick={() => onOpen(movement)}
        class="hf-press flex min-h-16 w-full items-center gap-3 py-3 text-left"
      >
        <span
          aria-hidden="true"
          class={`grid size-[38px] shrink-0 place-items-center rounded-lg ${
            out ? "bg-expense/[0.18] text-expense-fg" : "bg-accent/[0.16] text-accent-300"
          }`}
        >
          <Icon name={out ? "arrow-up" : "arrow-down"} size={20} />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="truncate text-[15px] font-medium">{movementName(movement)}</span>
            {movement.recurring && (
              <span class="inline-flex shrink-0 items-center gap-[3px] rounded-[4px] bg-accent-900 px-1.5 py-0.5 text-[10px] font-medium text-accent-300">
                <Icon name="repeat" size={10} />
                Mensal
              </span>
            )}
          </span>
          <span class="mt-0.5 flex items-center gap-1.5 text-xs text-fg/60">
            {author !== null && (
              <MiniAvatar name={author.name} color={resolveAuthorColor(state, movement.userId)} />
            )}
            <span>{author !== null ? `${author.name} · ${date}` : date}</span>
          </span>
        </span>
        <span class={`hf-num shrink-0 text-[15px] font-medium ${out ? "text-expense-fg" : ""}`}>
          {signedBRL(movement.amountMinor, "always")}
        </span>
      </button>
    </li>
  );
}

/** 2b: detalhe da emergência e da caixinha (a caixinha não tem medidor nem custo essencial). */
export function ReserveDetail({
  state,
  reserveId,
  today,
  onBack,
  onEdit,
  onDeposit,
  onWithdraw,
  onOpenMovement,
}: ReserveDetailProps) {
  const [expanded, setExpanded] = useState(false);
  const reserve: Reserve | undefined = state.reserves[reserveId];
  // Reserva apagada em outro aparelho: quem navega é o App, aqui só não desenhamos.
  if (!isAlive(reserve)) return null;

  const isEmergency = reserve.kind === "emergency";
  const balance = reserveBalance(state, reserve.id);
  const goal = isEmergency ? emergencyTarget(state, reserve, today) : null;
  const targetMinor = isEmergency ? (goal?.targetMinor ?? null) : reserve.targetMinor;
  const covered = goal === null ? 0 : monthsCovered(balance, goal.costMinor);
  const percent =
    targetMinor === null || targetMinor <= 0 ? null : Math.floor((balance / targetMinor) * 100);
  const completion =
    goal === null
      ? null
      : projectedCompletion(
          goal.targetMinor,
          balance,
          reserve.recurring?.amountMinor ?? null,
          today,
        );

  // Sem custo calculável (emergência nova, sem histórico) não há medidor nem custo, mas o
  // depósito mensal já configurado continua sendo informação válida.
  const infoRows: Omit<InfoRowProps, "first">[] = [];
  if (goal !== null) {
    infoRows.push({
      icon: "scales",
      title: "Custo essencial",
      value: `${wholeBRL(goal.costMinor)}/mês`,
      sub:
        reserve.essentialOverrideMinor !== null
          ? "Valor informado por você"
          : "Média de moradia, mercado, transporte, contas e saúde nos últimos 6 meses",
    });
  }
  if (isEmergency && reserve.recurring !== null) {
    infoRows.push({
      icon: "repeat",
      title: "Guardando todo mês",
      value: wholeBRL(reserve.recurring.amountMinor),
      sub: `Todo dia ${reserve.recurring.day}, do saldo do mês`,
    });
  }
  if (completion !== null) {
    infoRows.push({
      icon: "flag-checkered",
      title: "Nesse ritmo, completa em",
      value: deadlineLabel(completion, "0000-01-01"),
    });
  }

  const all = movementsOf(state, reserve.id);
  const shown = expanded ? all : all.slice(0, COLLAPSED_COUNT);

  return (
    <>
      <div class="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          class="hf-press -ml-1.5 flex h-9 items-center gap-1 pr-2 text-sm text-fg/65"
        >
          <Icon name="caret-left" size={18} />
          Reservas
        </button>
        <button
          type="button"
          onClick={onEdit}
          class="hf-press flex h-9 items-center px-1 text-sm font-medium text-accent-300"
        >
          Editar
        </button>
      </div>

      <div class="mt-3 flex items-center gap-3">
        {isEmergency ? (
          <AccentIconBox size={40} />
        ) : (
          <IconTile icon={reserve.icon} color={reserve.color} size={40} iconSize={22} />
        )}
        <h1 class="min-w-0 truncate text-2xl leading-tight font-medium tracking-[-0.02em]">
          {reserve.name}
        </h1>
      </div>

      <p class="mt-[18px]">
        <Money minor={balance} size={44} testId="reserve-balance" />
      </p>
      {targetMinor !== null && percent !== null && (
        <p class="hf-num mt-0.5 text-[13px] text-fg/60">
          de {signedBRL(targetMinor)} · {percent}% da meta
        </p>
      )}
      {!isEmergency && reserve.recurring !== null && (
        <p class="mt-1.5 text-[13px] text-fg/65">Guardando todo mês</p>
      )}
      {!isEmergency && reserve.deadline !== null && (
        <p class="mt-1.5 text-[13px] text-fg/65">
          Prazo · {deadlineLabel(reserve.deadline, today)}
        </p>
      )}

      {goal !== null && (
        <div class="mt-4">
          <MonthsMeter months={covered} height={10} />
          <MeterLabels months={covered} multiple={reserve.multiple ?? 6} />
        </div>
      )}

      {isEmergency && infoRows.length > 0 && (
        <ul class="mt-[18px] rounded-lg bg-surface px-3.5">
          {infoRows.map((row, index) => (
            <InfoRow key={row.title} first={index === 0} {...row} />
          ))}
        </ul>
      )}

      <div class="mt-4 flex gap-2.5">
        <button type="button" onClick={onDeposit} class={`${PRIMARY} flex-1`}>
          <Icon name="arrow-down" size={18} />
          Guardar
        </button>
        <button
          type="button"
          onClick={onWithdraw}
          disabled={balance <= 0}
          class={`${SECONDARY} flex-1`}
        >
          <Icon name="arrow-up" size={18} />
          Retirar
        </button>
      </div>

      <div class="mx-0.5 mt-[22px] mb-2 flex items-baseline justify-between">
        <h2 class="hf-label">Movimentos</h2>
        {all.length > COLLAPSED_COUNT && (
          // O botão fica no lugar e só troca o rótulo: o foco não se perde ao expandir.
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            class="hf-press text-[13px] text-accent-300"
          >
            {expanded ? "Ver menos" : "Ver todos"}
          </button>
        )}
      </div>
      <ul class="rounded-lg bg-surface px-3.5">
        {shown.map((m, index) => (
          <MovementRow
            key={m.id}
            state={state}
            movement={m}
            first={index === 0}
            onOpen={onOpenMovement}
          />
        ))}
      </ul>
    </>
  );
}
