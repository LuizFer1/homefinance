import { describe, expect, it } from "vitest";
import { stableEntityId } from "../ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { PaymentMethod } from "../model/payment-method";
import type { Recurrence } from "../model/recurrence";
import type { RecurrenceAdjustment } from "../model/recurrence-adjustment";
import { ALIVE, DELETED_AT } from "../model/row.fake";
import type { Transaction, TransactionDraft } from "../model/transaction";
import { adjustmentId } from "./adjustments";
import { planSeriesEdit } from "./edit-plan";
import { occurrenceKey } from "./schedule";

const ALUGUEL: Recurrence = {
  ...ALIVE,
  id: "SERIE-1",
  kind: "expense",
  description: "Aluguel",
  amountMinor: 200_000,
  currency: "BRL",
  categoryId: "CAT-CASA",
  paymentMethodId: null,
  cashbackMinor: null,
  frequency: "monthly",
  scheduleType: "dayOfMonth",
  scheduleN: 5,
  startOn: "2026-06-05",
  endOn: null,
  active: true,
};

function ocorrencia(period: string, over: Partial<Transaction> = {}): Transaction {
  const key = occurrenceKey(ALUGUEL.id, period);
  return {
    ...ALIVE,
    id: stableEntityId(key),
    kind: "expense",
    description: "Aluguel",
    amountMinor: 200_000,
    currency: "BRL",
    categoryId: "CAT-CASA",
    paymentMethodId: null,
    cashbackMinor: null,
    occurredOn: `${period}-05`,
    userId: "AUTOR",
    recurrenceId: ALUGUEL.id,
    occurrenceKey: key,
    ...over,
  };
}

function metodo(id: string, kind: string): PaymentMethod {
  return { ...ALIVE, id, name: id, icon: "wallet", color: "violet", kind } as PaymentMethod;
}

function estado(
  transactions: Transaction[],
  series: Recurrence = ALUGUEL,
  adjustments: RecurrenceAdjustment[] = [],
): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: { [series.id]: series },
    transactions: Object.fromEntries(transactions.map((t) => [t.id, t])),
    recurrenceAdjustments: Object.fromEntries(adjustments.map((a) => [a.id, a])),
    paymentMethods: {
      "PM-CREDITO": metodo("PM-CREDITO", "credit"),
      "PM-PIX": metodo("PM-PIX", "pix"),
    },
  };
}

/** O que o formulário mandaria para a ocorrência, com `over` por cima. */
function rascunho(row: Transaction, over: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    kind: row.kind,
    description: row.description,
    amountMinor: row.amountMinor,
    currency: "BRL",
    categoryId: row.categoryId,
    paymentMethodId: row.paymentMethodId,
    cashbackMinor: row.cashbackMinor,
    occurredOn: row.occurredOn,
    recurrenceId: row.recurrenceId,
    occurrenceKey: row.occurrenceKey,
    ...over,
  };
}

const JUN = ocorrencia("2026-06");
const JUL = ocorrencia("2026-07");
const AGO = ocorrencia("2026-08");
const SET = ocorrencia("2026-09");

describe("planSeriesEdit: quando perguntar", () => {
  it("categoria trocada numa ocorrência de série ativa pergunta", () => {
    const plan = planSeriesEdit(
      estado([JUN, JUL]),
      JUN.id,
      rascunho(JUN, { categoryId: "CAT-NOVA" }),
    );
    expect(plan?.fields).toEqual(["categoryId"]);
    expect(plan?.seriesPatch).toEqual({ categoryId: "CAT-NOVA" });
  });

  it("só data ou nas contas mudou: grava direto", () => {
    const state = estado([JUN]);
    expect(planSeriesEdit(state, JUN.id, rascunho(JUN, { occurredOn: "2026-06-07" }))).toBeNull();
    expect(planSeriesEdit(state, JUN.id, rascunho(JUN, { reportState: "hidden" }))).toBeNull();
    expect(planSeriesEdit(state, JUN.id, rascunho(JUN))).toBeNull();
  });

  it("lançamento avulso, série apagada, pausada ou de frequência desconhecida: grava direto", () => {
    const draft = (row: Transaction) => rascunho(row, { categoryId: "CAT-NOVA" });
    const avulso = ocorrencia("2026-06", { recurrenceId: null, occurrenceKey: null });
    expect(planSeriesEdit(estado([avulso]), avulso.id, draft(avulso))).toBeNull();
    expect(
      planSeriesEdit(estado([JUN], { ...ALUGUEL, deletedAt: DELETED_AT }), JUN.id, draft(JUN)),
    ).toBeNull();
    expect(planSeriesEdit(estado([JUN], { ...ALUGUEL, active: false }), JUN.id, draft(JUN))).toBe(
      null,
    );
    expect(
      planSeriesEdit(
        estado([JUN], { ...ALUGUEL, frequency: "lunar" as Recurrence["frequency"] }),
        JUN.id,
        draft(JUN),
      ),
    ).toBeNull();
  });

  it("última ocorrência de série com data final (última parcela) não tem próximos", () => {
    const parcelado = { ...ALUGUEL, endOn: "2026-08-05" };
    const state = estado([JUN, JUL, AGO], parcelado);
    expect(planSeriesEdit(state, AGO.id, rascunho(AGO, { categoryId: "CAT-NOVA" }))).toBeNull();
    expect(planSeriesEdit(state, JUL.id, rascunho(JUL, { categoryId: "CAT-NOVA" }))).not.toBeNull();
  });

  it("valor em série variável não é campo da série", () => {
    const variavel = { ...ALUGUEL, variable: true };
    const state = estado([JUN], variavel);
    expect(planSeriesEdit(state, JUN.id, rascunho(JUN, { amountMinor: 210_000 }))).toBeNull();
    // Mas a categoria da variável continua sendo da série.
    expect(
      planSeriesEdit(state, JUN.id, rascunho(JUN, { amountMinor: 210_000, categoryId: "X" }))
        ?.fields,
    ).toEqual(["categoryId"]);
  });
});

describe("planSeriesEdit: o que muda", () => {
  it("só os campos mudados nesta edição vão para a série", () => {
    // Junho já tinha descrição editada à mão; a edição de agora só troca a categoria.
    const junho = { ...JUN, description: "Aluguel junho" };
    const plan = planSeriesEdit(
      estado([junho, JUL]),
      junho.id,
      rascunho(junho, { categoryId: "CAT-NOVA" }),
    );
    expect(plan?.seriesPatch).toEqual({ categoryId: "CAT-NOVA" });
  });

  it("a ocorrência editada recebe o rascunho inteiro, inclusive a data", () => {
    const plan = planSeriesEdit(
      estado([JUN]),
      JUN.id,
      rascunho(JUN, { categoryId: "CAT-NOVA", occurredOn: "2026-06-06" }),
    );
    expect(plan?.transaction).toMatchObject({
      id: JUN.id,
      categoryId: "CAT-NOVA",
      occurredOn: "2026-06-06",
      userId: "AUTOR",
      updatedAt: JUN.updatedAt,
    });
  });

  it("próximas já lançadas seguem só onde ainda têm o valor antigo da série", () => {
    const setembroAMao = { ...SET, categoryId: "CAT-OUTRA" };
    const plan = planSeriesEdit(
      estado([JUN, JUL, AGO, setembroAMao]),
      JUL.id,
      rascunho(JUL, { categoryId: "CAT-NOVA" }),
    );
    // Junho é anterior: nunca muda. Julho é a editada. Setembro foi editada à mão.
    expect(plan?.following.map((row) => [row.id, row.categoryId])).toEqual([[AGO.id, "CAT-NOVA"]]);
    expect(plan?.kept.map((row) => row.id)).toEqual([setembroAMao.id]);
  });

  it("ocorrência apagada depois desta não volta nem muda", () => {
    const agoApagada = { ...AGO, deletedAt: DELETED_AT };
    const plan = planSeriesEdit(
      estado([JUL, agoApagada, SET]),
      JUL.id,
      rascunho(JUL, { categoryId: "CAT-NOVA" }),
    );
    expect(plan?.following.map((row) => row.id)).toEqual([SET.id]);
  });

  it("valor da fixa vira reajuste a partir da competência e leva as próximas que seguem", () => {
    const agoAMao = { ...AGO, amountMinor: 199_000 };
    const plan = planSeriesEdit(
      estado([JUN, JUL, agoAMao, SET]),
      JUL.id,
      rascunho(JUL, { amountMinor: 220_000 }),
    );
    expect(plan?.fields).toEqual(["amountMinor"]);
    expect(plan?.seriesPatch).toEqual({});
    expect(plan?.adjustment).toEqual({
      recurrenceId: ALUGUEL.id,
      fromPeriod: "2026-07",
      amountMinor: 220_000,
    });
    expect(plan?.following.map((row) => [row.id, row.amountMinor])).toEqual([[SET.id, 220_000]]);
    expect(plan?.kept.map((row) => row.id)).toEqual([agoAMao.id]);
    expect(plan?.transaction.amountMinor).toBe(220_000);
  });

  it("valor igual ao vigente na competência não cria reajuste", () => {
    const julhoAMao = { ...JUL, amountMinor: 150_000 };
    const plan = planSeriesEdit(
      estado([julhoAMao]),
      julhoAMao.id,
      rascunho(julhoAMao, { amountMinor: 200_000, description: "Aluguel apto" }),
    );
    expect(plan?.adjustment).toBeNull();
    expect(plan?.fields).toEqual(["description"]);
  });

  it("forma de pagamento sem cashback limpa o cashback da série e das próximas", () => {
    const serie = { ...ALUGUEL, paymentMethodId: "PM-CREDITO", cashbackMinor: 500 };
    const credito = { paymentMethodId: "PM-CREDITO", cashbackMinor: 500 };
    const jul = ocorrencia("2026-07", credito);
    const ago = ocorrencia("2026-08", credito);
    const plan = planSeriesEdit(
      estado([jul, ago], serie),
      jul.id,
      rascunho(jul, { paymentMethodId: "PM-PIX", cashbackMinor: null }),
    );
    expect(plan?.seriesPatch).toEqual({ paymentMethodId: "PM-PIX", cashbackMinor: null });
    expect(plan?.following).toEqual([
      expect.objectContaining({ id: ago.id, paymentMethodId: "PM-PIX", cashbackMinor: null }),
    ]);
  });

  it("semanal usa a data como competência", () => {
    const semanal = { ...ALUGUEL, frequency: "weekly" as const, startOn: "2026-06-01" };
    const key = (day: string) => occurrenceKey(semanal.id, day);
    const s1 = ocorrencia("x", {
      id: stableEntityId(key("2026-06-01")),
      occurrenceKey: key("2026-06-01"),
      occurredOn: "2026-06-01",
    });
    const s2 = ocorrencia("x", {
      id: stableEntityId(key("2026-06-08")),
      occurrenceKey: key("2026-06-08"),
      occurredOn: "2026-06-08",
    });
    const plan = planSeriesEdit(
      estado([s1, s2], semanal),
      s1.id,
      rascunho(s1, { categoryId: "CAT-NOVA", amountMinor: 1 }),
    );
    expect(plan?.adjustment?.fromPeriod).toBe("2026-06-01");
    expect(plan?.following.map((row) => row.id)).toEqual([s2.id]);
  });

  it("reajuste já gravado na mesma competência é o mesmo id", () => {
    const julho = {
      ...ALIVE,
      id: adjustmentId(ALUGUEL.id, "2026-07"),
      recurrenceId: ALUGUEL.id,
      fromPeriod: "2026-07",
      amountMinor: 210_000,
    };
    const jul = ocorrencia("2026-07", { amountMinor: 210_000 });
    const plan = planSeriesEdit(
      estado([jul], ALUGUEL, [julho]),
      jul.id,
      rascunho(jul, { amountMinor: 230_000 }),
    );
    expect(plan?.adjustmentPlan?.adjustmentId).toBe(julho.id);
  });
});
