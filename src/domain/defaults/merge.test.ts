import { describe, expect, it } from "vitest";
import { compareHlc } from "../clock/hlc";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Category } from "../model/category";
import type { PaymentMethod } from "../model/payment-method";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import { buildDefaultRows, DEFAULT_CATEGORIES, DEFAULT_METHODS } from "./defaults";
import { planDefaultsMerge } from "./merge";

const FOOD = DEFAULT_CATEGORIES[0];
const PIX = DEFAULT_METHODS[1];
if (FOOD === undefined || PIX === undefined) throw new Error("lista padrão mudou");

const hlc = (millis: number) =>
  `${String(millis).padStart(13, "0")}-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ`;

function stamper() {
  let millis = 1_800_000_000_000;
  return () => {
    millis += 1;
    return hlc(millis);
  };
}

function legacyFood(id: string, extra: Partial<Category> = {}): Category {
  return { ...ALIVE, ...(FOOD?.draft as Category), id, ...extra };
}

function legacyPix(id: string, extra: Partial<PaymentMethod> = {}): PaymentMethod {
  return { ...ALIVE, ...(PIX?.draft as PaymentMethod), id, ...extra };
}

const byId = <T extends { id: string }>(rows: T[]) =>
  Object.fromEntries(rows.map((row) => [row.id, row]));

function state(categories: Category[], methods: PaymentMethod[] = []): AppState {
  return { ...EMPTY_APP_STATE, categories: byId(categories), paymentMethods: byId(methods) };
}

describe("planDefaultsMerge", () => {
  it("sem cópias não planeja nada", () => {
    const { categories, paymentMethods } = buildDefaultRows();
    expect(planDefaultsMerge(state(categories, paymentMethods), stamper())).toBeNull();
  });

  it("funde as cópias na linha estável com o conteúdo da mais recente", () => {
    const a = legacyFood("A", { updatedAt: hlc(100) });
    const b = legacyFood("B", { updatedAt: hlc(200), color: "rose" });
    const plan = planDefaultsMerge(state([a, b]), stamper());

    const rows = byId(plan?.rows.categories ?? []);
    expect(rows[FOOD.id]).toMatchObject({
      name: "Alimentação",
      color: "rose",
      deletedAt: null,
      mergedInto: null,
      dirty: 1,
    });
    expect(rows.A).toMatchObject({ mergedInto: FOOD.id, dirty: 1 });
    expect(rows.B).toMatchObject({ mergedInto: FOOD.id, dirty: 1 });
    expect(rows.A?.deletedAt).not.toBeNull();
    expect(compareHlc(rows.A?.updatedAt ?? "", hlc(100))).toBeGreaterThan(0);
    expect(plan?.expected.categories).toEqual({ [FOOD.id]: null, A: hlc(100), B: hlc(200) });
  });

  it("substitui a semente ainda na gênese", () => {
    const { categories } = buildDefaultRows();
    const plan = planDefaultsMerge(
      state([...categories, legacyFood("A", { color: "rose" })]),
      stamper(),
    );
    const stable = plan?.rows.categories?.find((row) => row.id === FOOD.id);
    expect(stable?.color).toBe("rose");
    expect(plan?.expected.categories?.[FOOD.id]).toBe(categories[0]?.updatedAt);
  });

  it("não regrava a estável que outro aparelho já migrou", () => {
    const stable = legacyFood(FOOD.id, { updatedAt: hlc(500), color: "amber", mergedInto: null });
    const plan = planDefaultsMerge(state([stable, legacyFood("A")]), stamper());
    expect(plan?.rows.categories?.map((row) => row.id)).toEqual(["A"]);
    expect(plan?.rows.categories?.[0]?.mergedInto).toBe(FOOD.id);
  });

  it("deixa em paz cópia renomeada, cópia apagada e categoria de outro tipo", () => {
    const plan = planDefaultsMerge(
      state([
        legacyFood("renomeada", { name: "Comida" }),
        legacyFood("apagada", { deletedAt: DELETED_AT }),
        legacyFood("receita", { kind: "income" }),
      ]),
      stamper(),
    );
    expect(plan).toBeNull();
  });

  it("não funde quando a estável foi apagada ou renomeada", () => {
    const apagada = legacyFood(FOOD.id, { updatedAt: hlc(500), deletedAt: hlc(500) });
    expect(planDefaultsMerge(state([apagada, legacyFood("A")]), stamper())).toBeNull();

    const renomeada = legacyFood(FOOD.id, { updatedAt: hlc(500), name: "Comida" });
    expect(planDefaultsMerge(state([renomeada, legacyFood("A")]), stamper())).toBeNull();
  });

  it("funde formas de pagamento pelo mesmo caminho", () => {
    const plan = planDefaultsMerge(state([], [legacyPix("P1"), legacyPix("P2")]), stamper());
    const rows = byId(plan?.rows.paymentMethods ?? []);
    expect(rows[PIX.id]?.kind).toBe("pix");
    expect(rows.P1?.mergedInto).toBe(PIX.id);
    expect(rows.P2?.mergedInto).toBe(PIX.id);
    expect(plan?.rows.categories).toBeUndefined();
  });

  it("aplicar o plano e planejar de novo não planeja nada", () => {
    const before = state([legacyFood("A"), legacyFood("B")], [legacyPix("P1")]);
    const plan = planDefaultsMerge(before, stamper());
    const after = state(
      [...Object.values(before.categories), ...(plan?.rows.categories ?? [])].reduce<Category[]>(
        (acc, row) => [...acc.filter((r) => r.id !== row.id), row],
        [],
      ),
      [...Object.values(before.paymentMethods), ...(plan?.rows.paymentMethods ?? [])].reduce<
        PaymentMethod[]
      >((acc, row) => [...acc.filter((r) => r.id !== row.id), row], []),
    );
    expect(planDefaultsMerge(after, stamper())).toBeNull();
  });
});
