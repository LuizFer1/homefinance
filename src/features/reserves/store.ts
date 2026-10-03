import { buildRow } from "../../data/repository";
import { shiftMonth } from "../../domain/dates/calendar";
import type { Ulid } from "../../domain/ids/ulid";
import { isAlive } from "../../domain/model/base";
import {
  EMERGENCY_COLOR,
  EMERGENCY_ICON,
  EMERGENCY_NAME,
  type EmergencyMultiple,
  type RecurringDeposit,
  type Reserve,
  type ReserveDraft,
  type ReserveKind,
  type ReserveMovement,
  type ReserveMovementDraft,
  WITHDRAW_REASONS,
  type WithdrawReason,
} from "../../domain/model/reserve";
import type { ColorToken, IconKey } from "../../domain/model/tokens";
import { MAX_MINOR } from "../../domain/money/mask";
import { monthOf } from "../../domain/projections/periods";
import { emergencyOf, reserveBalance } from "../../domain/reserves/balances";
import { depositId, planDeposits } from "../../domain/reserves/deposits";
import { findEssentialCategoryIds } from "../../domain/reserves/essential";
import { describeError, type Session } from "../session/session";

export interface ReserveInput {
  kind: ReserveKind;
  name: string;
  icon: IconKey;
  color: ColorToken;
  targetMinor: number | null;
  multiple: EmergencyMultiple | null;
  essentialOverrideMinor: number | null;
  deadline: string | null;
  /** Valor do depósito mensal ligado no formulário (vale a partir do mês seguinte), ou null. */
  recurringAmountMinor: number | null;
}

export interface MovementInput {
  /** Sempre positivo; o sinal vem da operação. */
  amountMinor: number;
  description: string | null;
  occurredOn: string;
}

/**
 * Reservas e seus movimentos. Guardar e retirar são linhas de
 * `reserveMovements`, nunca transações: guardar não é despesa.
 */
export interface ReservesStore {
  create: (input: ReserveInput, today: string) => Promise<Reserve>;
  edit: (id: Ulid, input: ReserveInput, today: string) => Promise<Reserve>;
  remove: (id: Ulid, today: string) => Promise<void>;
  /** `setRecurring`: true liga (o próprio depósito vira o do mês), false desliga, undefined não mexe. */
  deposit: (reserveId: Ulid, input: MovementInput, setRecurring?: boolean) => Promise<void>;
  withdraw: (
    reserveId: Ulid,
    input: MovementInput & { reason: WithdrawReason },
  ) => Promise<ReserveMovement>;
  editMovement: (
    id: Ulid,
    input: MovementInput & { reason: WithdrawReason | null },
  ) => Promise<ReserveMovement>;
  removeMovement: (id: Ulid) => Promise<ReserveMovement>;
  materializeDue: (today: string) => Promise<void>;
}

/**
 * Guarda para qualquer chamador, não só o sheet: centavo fracionário ou valor
 * acima do campo de dinheiro entraria no log, que é eterno. O teto é o mesmo
 * `MAX_MINOR` do campo, para os dois não discordarem do que é válido.
 */
function assertAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_MINOR) {
    throw new Error("Valor inválido");
  }
}

/**
 * O tipo só garante o motivo para quem compila contra ele; a UI (ou uma
 * versão futura) pode mandar qualquer string, e o log é eterno.
 */
function assertReason(reason: string | null): void {
  if (reason === null || !(WITHDRAW_REASONS as readonly string[]).includes(reason)) {
    throw new Error("Escolha o motivo da retirada");
  }
}

/** Campos-objeto: `!==` do repositório sempre os veria como mudados. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function dayOf(date: string): number {
  return Number(date.slice(8, 10));
}

export function createReservesStore(session: Session): ReservesStore {
  /**
   * Toda falha preenche `session.error` e relança, como nas outras stores —
   * inclusive as de validação, que acontecem antes de qualquer escrita: quem
   * só observa o signal não pode perder o motivo.
   */
  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (cause) {
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  function aliveReserve(id: Ulid): Reserve {
    const r = session.state.value.reserves[id];
    if (!isAlive(r)) throw new Error("Reserva não existe");
    return r;
  }

  function draftOf(input: ReserveInput, today: string, current: Reserve | null): ReserveDraft {
    const name = input.name.trim();
    const emergency = input.kind === "emergency";
    if (!emergency && name === "") throw new Error("Dê um nome à reserva");
    for (const v of [input.targetMinor, input.essentialOverrideMinor, input.recurringAmountMinor]) {
      if (v !== null) assertAmount(v);
    }
    // O formulário liga o depósito a partir do mês seguinte: criar ou editar
    // a reserva não pode tirar dinheiro do mês sem um Guardar explícito.
    // Valor igual ao já gravado preserva `day`/`since`.
    let recurring: RecurringDeposit | null = null;
    if (input.recurringAmountMinor !== null) {
      recurring =
        current?.recurring?.amountMinor === input.recurringAmountMinor
          ? current.recurring
          : {
              amountMinor: input.recurringAmountMinor,
              day: dayOf(today),
              since: shiftMonth(monthOf(today), 1),
            };
    }
    return {
      kind: input.kind,
      name: emergency ? EMERGENCY_NAME : name,
      icon: emergency ? EMERGENCY_ICON : input.icon,
      color: emergency ? EMERGENCY_COLOR : input.color,
      targetMinor: emergency ? null : input.targetMinor,
      multiple: emergency ? (input.multiple ?? 6) : null,
      // Os ids são achados uma vez, na criação: depois disso renomear
      // "Moradia" não pode mudar a meta de ninguém.
      essentialCategoryIds: emergency
        ? (current?.essentialCategoryIds ?? findEssentialCategoryIds(session.state.value))
        : null,
      essentialOverrideMinor: emergency ? input.essentialOverrideMinor : null,
      deadline: emergency ? null : input.deadline,
      recurring,
    };
  }

  /** Autor decidido aqui, nunca pelo formulário; nenhum update o reescreve. */
  function movementDraft(
    reserveId: Ulid,
    signed: number,
    input: Pick<MovementInput, "description" | "occurredOn">,
    reason: WithdrawReason | null,
    recurring = false,
  ): ReserveMovementDraft {
    return {
      reserveId,
      amountMinor: signed,
      occurredOn: input.occurredOn,
      userId: session.localUserId.value,
      description: input.description?.trim() || null,
      reason,
      recurring,
    };
  }

  async function materializeDue(today: string): Promise<void> {
    await guarded(async () => {
      const plans = planDeposits(session.state.value, today);
      if (plans.length === 0) return;
      const clock = session.clock();
      const userId = session.localUserId.value;
      // `insertMissing`, nunca `putRows`: o state pode estar velho, e um
      // depósito apagado noutra aba voltaria vivo com um `bulkPut`.
      await session.insertMissing(
        "reserveMovements",
        plans.map((p) =>
          buildRow<ReserveMovement>(
            clock,
            {
              reserveId: p.reserveId,
              amountMinor: p.amountMinor,
              occurredOn: p.occurredOn,
              userId,
              description: null,
              reason: null,
              recurring: true,
            },
            p.id,
          ),
        ),
      );
    });
  }

  return {
    create: (input, today) =>
      guarded(async () => {
        if (input.kind === "emergency" && emergencyOf(session.state.value) !== null) {
          throw new Error("Você já tem uma reserva de emergência");
        }
        const draft = draftOf(input, today, null);
        // Sem `materializeDue` aqui: a regra do formulário sempre começa no
        // mês seguinte, então não haveria o que depositar — e uma rejeição
        // depois da gravação convidaria a pessoa a criar a reserva de novo.
        return session.mutate("reserves", (repo) => repo.create(draft));
      }),

    edit: (id, input, today) =>
      guarded(async () => {
        const current = aliveReserve(id);
        // O tipo não muda na edição: caixinha virar emergência pularia a
        // checagem de "só uma", e o contrário perderia os ids essenciais.
        const draft = draftOf({ ...input, kind: current.kind }, today, current);
        // `recurring` e `essentialCategoryIds` vêm do state e o repositório
        // compara com `!==` a cópia lida do banco: iguais em valor, sairiam
        // "mudados" e um salvar sem mudança carimbaria um HLC novo. No LWW
        // por linha, esse carimbo vazio venceria uma edição real feita no
        // outro celular. Iguais em valor ficam fora do update.
        const changes: Partial<ReserveDraft> = { ...draft };
        if (sameValue(draft.recurring, current.recurring)) delete changes.recurring;
        if (sameValue(draft.essentialCategoryIds, current.essentialCategoryIds)) {
          delete changes.essentialCategoryIds;
        }
        const saved = await session.mutate("reserves", (repo) => repo.update(id, changes));
        // A edição já está gravada: falha da materialização não pode
        // rejeitá-la (a tela trataria como não salva). Ela já se reporta em
        // `session.error`, e a próxima abertura tenta de novo.
        await materializeDue(today).catch(() => {});
        return saved;
      }),

    remove: (id, today) =>
      guarded(async () => {
        const current = aliveReserve(id);
        // Saldo lido da memória: um Guardar concorrente noutra aba não entra
        // nas versões esperadas (a linha dele é nova). Janela aceita — o mesmo
        // vale para `withdraw`; a próxima abertura mostra o saldo real.
        const balance = reserveBalance(session.state.value, id);
        if (balance === 0) {
          await session.mutate("reserves", (repo) => repo.remove(id));
          return;
        }
        const clock = session.clock();
        const final = buildRow<ReserveMovement>(
          clock,
          movementDraft(
            id,
            -balance,
            { description: "Reserva excluída", occurredOn: today },
            // Saldo negativo só vem de dado anômalo (sync); aí a linha final é
            // entrada, e entrada não tem motivo.
            balance > 0 ? "other" : null,
          ),
        );
        const { hlc } = clock.stamp();
        const deleted: Reserve = { ...current, deletedAt: hlc, updatedAt: hlc, dirty: 1 };
        // Um lote: a retirada final e a exclusão entram juntas ou nada entra.
        // Separadas, uma falha no meio sumiria com o saldo sem devolvê-lo ao mês.
        await session.putRowsIfCurrent(
          { reserves: [deleted], reserveMovements: [final] },
          { reserves: { [id]: current.updatedAt }, reserveMovements: { [final.id]: null } },
        );
      }),

    deposit: (reserveId, input, setRecurring) =>
      guarded(async () => {
        assertAmount(input.amountMinor);
        const current = aliveReserve(reserveId);
        const month = monthOf(input.occurredOn);
        const monthId = depositId(reserveId, month);
        const turningOn = setRecurring === true && current.recurring === null;
        // Ligar a recorrência no Guardar: este depósito **é** o do mês (id
        // estável), senão a materialização guardaria de novo no mesmo dia.
        const asMonthly = turningOn && session.state.value.reserveMovements[monthId] === undefined;
        const clock = session.clock();
        const movement = buildRow<ReserveMovement>(
          clock,
          movementDraft(reserveId, input.amountMinor, input, null, asMonthly),
          asMonthly ? monthId : undefined,
        );
        let recurring = current.recurring;
        if (turningOn) {
          recurring = {
            amountMinor: input.amountMinor,
            day: dayOf(input.occurredOn),
            since: month,
          };
        }
        if (setRecurring === false) recurring = null;

        if (recurring === current.recurring) {
          await session.putRowsIfCurrent(
            { reserveMovements: [movement] },
            { reserveMovements: { [movement.id]: null } },
          );
          return;
        }
        // Reserva e depósito no mesmo lote, e só se a reserva ainda estiver
        // na versão lida: regravar a linha inteira a partir de um state velho
        // desfaria uma edição (ou ressuscitaria uma exclusão) feita noutra aba.
        const reserve: Reserve = { ...current, recurring, updatedAt: clock.stamp().hlc, dirty: 1 };
        await session.putRowsIfCurrent(
          { reserves: [reserve], reserveMovements: [movement] },
          {
            reserves: { [reserveId]: current.updatedAt },
            reserveMovements: { [movement.id]: null },
          },
        );
      }),

    withdraw: (reserveId, input) =>
      guarded(async () => {
        assertAmount(input.amountMinor);
        assertReason(input.reason);
        aliveReserve(reserveId);
        // Saldo da memória, sem versão esperada: ver a janela aceita em `remove`.
        // Só o saldo da reserva limita: o dinheiro volta para o mês, e o
        // mês nunca fica menor por causa de uma retirada.
        if (input.amountMinor > reserveBalance(session.state.value, reserveId)) {
          throw new Error("Maior que o saldo da reserva");
        }
        const draft = movementDraft(reserveId, -input.amountMinor, input, input.reason);
        return session.mutate("reserveMovements", (repo) => repo.create(draft));
      }),

    editMovement: (id, input) =>
      guarded(async () => {
        assertAmount(input.amountMinor);
        const current = session.state.value.reserveMovements[id];
        if (!isAlive(current)) throw new Error("Movimento não existe");
        // Movimentos de reserva apagada já foram zerados pela retirada final:
        // mexer num deles desequilibraria um saldo que ninguém mais vê.
        aliveReserve(current.reserveId);
        // O sinal é da operação original: editar não transforma retirada em
        // depósito. Autor e `recurring` ficam como estão.
        const out = current.amountMinor < 0;
        if (out) assertReason(input.reason);
        const signed = out ? -input.amountMinor : input.amountMinor;
        const after =
          reserveBalance(session.state.value, current.reserveId) - current.amountMinor + signed;
        if (after < 0) {
          throw new Error(out ? "Maior que o saldo da reserva" : "A reserva ficaria negativa");
        }
        return session.mutate("reserveMovements", (repo) =>
          repo.update(id, {
            amountMinor: signed,
            description: input.description?.trim() || null,
            occurredOn: input.occurredOn,
            reason: out ? input.reason : null,
          }),
        );
      }),

    removeMovement: (id) =>
      guarded(async () => {
        const current = session.state.value.reserveMovements[id];
        if (current === undefined) throw new Error("Movimento não existe");
        // Apagar de novo não é erro: o toque duplo na lixeira não vira aviso.
        if (!isAlive(current)) return current;
        // Mesmo motivo de `editMovement`: reserva apagada fica congelada.
        aliveReserve(current.reserveId);
        // Apagar um depósito já gasto por retiradas deixaria a reserva devendo.
        if (reserveBalance(session.state.value, current.reserveId) - current.amountMinor < 0) {
          throw new Error("A reserva ficaria negativa");
        }
        return session.mutate("reserveMovements", (repo) => repo.remove(id));
      }),

    materializeDue,
  };
}
