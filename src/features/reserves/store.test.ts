import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../../data/db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { isAlive } from "../../domain/model/base";
import type { Category } from "../../domain/model/category";
import { ALIVE, DELETED_AT } from "../../domain/model/row.fake";
import type { Transaction } from "../../domain/model/transaction";
import { reserveBalance } from "../../domain/reserves/balances";
import { depositId } from "../../domain/reserves/deposits";
import { movement } from "../../domain/reserves/fixtures.fake";
import { createSession, type Session } from "../session/session";
import { createReservesStore, type ReserveInput, type ReservesStore } from "./store";

let db: HomeFinanceDb;
let session: Session;
let store: ReservesStore;

const GOAL: ReserveInput = {
  kind: "goal",
  name: "Viagem",
  icon: "plane-tilt",
  color: "sky",
  targetMinor: 600_000,
  multiple: null,
  essentialOverrideMinor: null,
  deadline: "2027-07",
  recurringAmountMinor: null,
};
const EMERGENCY: ReserveInput = {
  ...GOAL,
  kind: "emergency",
  name: "",
  targetMinor: null,
  multiple: 6,
  deadline: null,
};

const salary = (amountMinor: number, occurredOn: string): Transaction => ({
  ...ALIVE,
  id: `SAL-${occurredOn}`,
  kind: "income",
  description: "Salário",
  amountMinor,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn,
  userId: null,
  recurrenceId: null,
  occurrenceKey: null,
});

beforeEach(async () => {
  db = openTestDb();
  session = createSession(testSessionDeps(db));
  await session.init();
  await session.putRows({ transactions: [salary(300_000, "2026-10-01")] }, { localUserId: "U1" });
  store = createReservesStore(session);
});

afterEach(async () => {
  await db.delete();
});

describe("create", () => {
  it("cria caixinha; nome vazio é rejeitado", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    expect(await db.reserves.get(r.id)).toMatchObject({ name: "Viagem", kind: "goal" });
    await expect(store.create({ ...GOAL, name: "  " }, "2026-10-10")).rejects.toThrow();
  });

  it("emergência ganha nome, ícone e ids essenciais; a segunda é rejeitada", async () => {
    const moradia: Category = {
      ...ALIVE,
      id: "MOR",
      name: "Moradia",
      icon: "house",
      color: "amber",
      kind: "expense",
    };
    await session.putRows({ categories: [moradia] });
    const e = await store.create(EMERGENCY, "2026-10-10");
    expect(e).toMatchObject({
      name: "Reserva de emergência",
      icon: "lifebuoy",
      essentialCategoryIds: ["MOR"],
      targetMinor: null,
    });
    await expect(store.create(EMERGENCY, "2026-10-10")).rejects.toThrow("Você já tem uma");
  });

  it("depósito mensal do formulário vale a partir do mês seguinte, no dia de hoje", async () => {
    const r = await store.create({ ...GOAL, recurringAmountMinor: 56_000 }, "2026-10-10");
    expect(r.recurring).toEqual({ amountMinor: 56_000, day: 10, since: "2026-11" });
    await store.materializeDue("2026-10-20");
    expect(reserveBalance(session.state.value, r.id)).toBe(0);
  });
});

describe("deposit / withdraw", () => {
  it("guarda com autor; retirada exige motivo e respeita o saldo da reserva", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.deposit(r.id, { amountMinor: 50_000, description: null, occurredOn: "2026-10-10" });
    const m = Object.values(session.state.value.reserveMovements)[0];
    expect(m).toMatchObject({ amountMinor: 50_000, userId: "U1", reason: null, recurring: false });

    await expect(
      store.withdraw(r.id, {
        amountMinor: 60_000,
        description: null,
        occurredOn: "2026-10-11",
        reason: "car",
      }),
    ).rejects.toThrow("Maior que o saldo da reserva");
    const w = await store.withdraw(r.id, {
      amountMinor: 20_000,
      description: "Pneu",
      occurredOn: "2026-10-11",
      reason: "car",
    });
    expect(w).toMatchObject({ amountMinor: -20_000, reason: "car" });
    expect(reserveBalance(session.state.value, r.id)).toBe(30_000);
  });

  it("guardar acima do saldo do mês não é erro de store", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.deposit(r.id, {
      amountMinor: 900_000,
      description: null,
      occurredOn: "2026-10-10",
    });
    expect(reserveBalance(session.state.value, r.id)).toBe(900_000);
  });

  it("valor zero, negativo ou fracionário é rejeitado", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    for (const amountMinor of [0, -1, 1.5]) {
      await expect(
        store.deposit(r.id, { amountMinor, description: null, occurredOn: "2026-10-10" }),
      ).rejects.toThrow();
    }
  });

  it("ligar 'Guardar todo mês' no depósito: o depósito é o do mês e a materialização não repete", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.deposit(
      r.id,
      { amountMinor: 50_000, description: null, occurredOn: "2026-10-10" },
      true,
    );
    expect(session.state.value.reserves[r.id]?.recurring).toEqual({
      amountMinor: 50_000,
      day: 10,
      since: "2026-10",
    });
    expect(session.state.value.reserveMovements[depositId(r.id, "2026-10")]).toMatchObject({
      recurring: true,
    });
    await store.materializeDue("2026-10-25");
    expect(reserveBalance(session.state.value, r.id)).toBe(50_000);
  });

  it("desligar no depósito limpa a recorrência", async () => {
    const r = await store.create({ ...GOAL, recurringAmountMinor: 1_000 }, "2026-10-10");
    await store.deposit(
      r.id,
      { amountMinor: 1_000, description: null, occurredOn: "2026-10-10" },
      false,
    );
    expect(session.state.value.reserves[r.id]?.recurring).toBeNull();
  });
});

describe("materializeDue", () => {
  it("deposita uma vez; apagado não volta", async () => {
    const r = await store.create(GOAL, "2026-09-01");
    await session.putRows({
      reserves: [{ ...r, recurring: { amountMinor: 50_000, day: 6, since: "2026-10" } }],
    });
    await store.materializeDue("2026-10-06");
    await store.materializeDue("2026-10-07");
    expect(reserveBalance(session.state.value, r.id)).toBe(50_000);

    await store.removeMovement(depositId(r.id, "2026-10"));
    await store.materializeDue("2026-10-08");
    expect(reserveBalance(session.state.value, r.id)).toBe(0);
  });
});

describe("editMovement / removeMovement", () => {
  it("edita mantendo o sinal e o autor; retirada sem motivo é rejeitada", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.deposit(r.id, { amountMinor: 50_000, description: null, occurredOn: "2026-10-10" });
    const w = await store.withdraw(r.id, {
      amountMinor: 1_000,
      description: null,
      occurredOn: "2026-10-10",
      reason: "home",
    });
    const edited = await store.editMovement(w.id, {
      amountMinor: 2_000,
      description: "x",
      occurredOn: "2026-10-11",
      reason: "work",
    });
    expect(edited).toMatchObject({ amountMinor: -2_000, reason: "work", userId: "U1" });
    await expect(
      store.editMovement(w.id, {
        amountMinor: 2_000,
        description: null,
        occurredOn: "2026-10-11",
        reason: null,
      }),
    ).rejects.toThrow();
  });
});

describe("remove", () => {
  it("com saldo, grava a retirada final e apaga a reserva no mesmo lote", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.deposit(r.id, { amountMinor: 50_000, description: null, occurredOn: "2026-10-10" });
    await store.remove(r.id, "2026-10-12");
    expect(isAlive(session.state.value.reserves[r.id])).toBe(false);
    const final = Object.values(session.state.value.reserveMovements).find(
      (m) => m.amountMinor < 0,
    );
    expect(final).toMatchObject({
      amountMinor: -50_000,
      reason: "other",
      description: "Reserva excluída",
      occurredOn: "2026-10-12",
    });
    expect(reserveBalance(session.state.value, r.id)).toBe(0);
  });

  it("sem saldo, só apaga", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.remove(r.id, "2026-10-12");
    expect(Object.keys(session.state.value.reserveMovements)).toHaveLength(0);
  });
});

/** Id do único movimento vivo que satisfaz `pick` (deposit não devolve a linha). */
function movementId(pick: (amountMinor: number) => boolean): string {
  const found = Object.values(session.state.value.reserveMovements).find(
    (m) => isAlive(m) && pick(m.amountMinor),
  );
  if (found === undefined) throw new Error("movimento não encontrado");
  return found.id;
}

const MORADIA: Category = {
  ...ALIVE,
  id: "MOR",
  name: "Moradia",
  icon: "house",
  color: "amber",
  kind: "expense",
};

describe("edit", () => {
  it("salvar sem mudança não carimba HLC novo", async () => {
    await session.putRows({ categories: [MORADIA] });
    const g = await store.create({ ...GOAL, recurringAmountMinor: 56_000 }, "2026-10-10");
    const e = await store.create(EMERGENCY, "2026-10-10");
    await store.edit(g.id, { ...GOAL, recurringAmountMinor: 56_000 }, "2026-10-12");
    await store.edit(e.id, EMERGENCY, "2026-10-12");
    expect((await db.reserves.get(g.id))?.updatedAt).toBe(g.updatedAt);
    expect((await db.reserves.get(e.id))?.updatedAt).toBe(e.updatedAt);
  });

  it("mesmo valor mensal preserva dia e início; valor novo vale do mês seguinte, no dia de hoje", async () => {
    const r = await store.create({ ...GOAL, recurringAmountMinor: 56_000 }, "2026-10-10");
    const same = await store.edit(
      r.id,
      { ...GOAL, name: "Praia", recurringAmountMinor: 56_000 },
      "2026-12-03",
    );
    expect(same.recurring).toEqual({ amountMinor: 56_000, day: 10, since: "2026-11" });
    const changed = await store.edit(r.id, { ...GOAL, recurringAmountMinor: 60_000 }, "2026-12-03");
    expect(changed.recurring).toEqual({ amountMinor: 60_000, day: 3, since: "2027-01" });
  });

  it("emergência mantém o tipo e os ids essenciais gravados na criação", async () => {
    await session.putRows({ categories: [MORADIA] });
    const e = await store.create(EMERGENCY, "2026-10-10");
    await session.putRows({ categories: [{ ...MORADIA, id: "ALI", name: "Alimentação" }] });
    const edited = await store.edit(e.id, { ...GOAL, name: "Outra" }, "2026-10-12");
    expect(edited).toMatchObject({
      kind: "emergency",
      name: "Reserva de emergência",
      essentialCategoryIds: ["MOR"],
      targetMinor: null,
    });
  });
});

describe("validações de movimento", () => {
  it("motivo fora da lista é rejeitado na retirada e na edição", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.deposit(r.id, { amountMinor: 50_000, description: null, occurredOn: "2026-10-10" });
    const bad = "xyz" as unknown as "car";
    const base = { amountMinor: 1_000, description: null, occurredOn: "2026-10-10" };
    await expect(store.withdraw(r.id, { ...base, reason: bad })).rejects.toThrow(
      "Escolha o motivo da retirada",
    );
    const w = await store.withdraw(r.id, { ...base, reason: "car" });
    await expect(store.editMovement(w.id, { ...base, reason: bad })).rejects.toThrow(
      "Escolha o motivo da retirada",
    );
    expect(session.error.value).toBe("Escolha o motivo da retirada");
  });

  it("editar retirada não passa do saldo + o valor original", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.deposit(r.id, { amountMinor: 50_000, description: null, occurredOn: "2026-10-10" });
    const input = { description: null, occurredOn: "2026-10-10", reason: "car" as const };
    const w = await store.withdraw(r.id, { ...input, amountMinor: 10_000 });
    await expect(store.editMovement(w.id, { ...input, amountMinor: 50_001 })).rejects.toThrow(
      "Maior que o saldo da reserva",
    );
    await store.editMovement(w.id, { ...input, amountMinor: 50_000 });
    expect(reserveBalance(session.state.value, r.id)).toBe(0);
  });

  it("reduzir ou apagar depósito já retirado não deixa a reserva negativa", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.deposit(r.id, { amountMinor: 50_000, description: null, occurredOn: "2026-10-10" });
    const d = movementId((a) => a > 0);
    await store.withdraw(r.id, {
      amountMinor: 30_000,
      description: null,
      occurredOn: "2026-10-11",
      reason: "car",
    });
    const input = { description: null, occurredOn: "2026-10-10", reason: null };
    await expect(store.editMovement(d, { ...input, amountMinor: 20_000 })).rejects.toThrow(
      "A reserva ficaria negativa",
    );
    await expect(store.removeMovement(d)).rejects.toThrow("A reserva ficaria negativa");
    await store.editMovement(d, { ...input, amountMinor: 30_000 });
    expect(reserveBalance(session.state.value, r.id)).toBe(0);
  });

  it("movimento de reserva apagada fica congelado", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await store.deposit(r.id, { amountMinor: 50_000, description: null, occurredOn: "2026-10-10" });
    const d = movementId((a) => a > 0);
    await store.remove(r.id, "2026-10-12");
    await expect(
      store.editMovement(d, {
        amountMinor: 1_000,
        description: null,
        occurredOn: "2026-10-10",
        reason: null,
      }),
    ).rejects.toThrow("Reserva não existe");
    await expect(store.removeMovement(d)).rejects.toThrow("Reserva não existe");
  });

  it("editar o depósito mensal mantém recurring e motivo nulo", async () => {
    const r = await store.create(GOAL, "2026-09-01");
    await session.putRows({
      reserves: [{ ...r, recurring: { amountMinor: 50_000, day: 6, since: "2026-10" } }],
    });
    await store.materializeDue("2026-10-06");
    const edited = await store.editMovement(depositId(r.id, "2026-10"), {
      amountMinor: 40_000,
      description: "ajuste",
      occurredOn: "2026-10-06",
      reason: null,
    });
    expect(edited).toMatchObject({ amountMinor: 40_000, recurring: true, reason: null });
  });
});

describe("casos de borda do depósito e da exclusão", () => {
  it("ligar a recorrência quando o id do mês já existe: id aleatório, e a materialização não repete", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    const monthId = depositId(r.id, "2026-10");
    await session.putRows({
      reserveMovements: [
        movement(monthId, r.id, 50_000, "2026-10-05", { recurring: true, deletedAt: DELETED_AT }),
      ],
    });
    await store.deposit(
      r.id,
      { amountMinor: 30_000, description: null, occurredOn: "2026-10-10" },
      true,
    );
    const id = movementId((a) => a > 0);
    expect(id).not.toBe(monthId);
    expect(session.state.value.reserveMovements[id]).toMatchObject({ recurring: false });
    expect(session.state.value.reserves[r.id]?.recurring).toEqual({
      amountMinor: 30_000,
      day: 10,
      since: "2026-10",
    });
    await store.materializeDue("2026-10-25");
    expect(reserveBalance(session.state.value, r.id)).toBe(30_000);
  });

  it("excluir com saldo negativo grava entrada final sem motivo", async () => {
    const r = await store.create(GOAL, "2026-10-10");
    await session.putRows({ reserveMovements: [movement("NEG", r.id, -5_000, "2026-10-05")] });
    await store.remove(r.id, "2026-10-12");
    const final = Object.values(session.state.value.reserveMovements).find((m) => m.id !== "NEG");
    expect(final).toMatchObject({
      amountMinor: 5_000,
      reason: null,
      description: "Reserva excluída",
    });
    expect(reserveBalance(session.state.value, r.id)).toBe(0);
  });
});
