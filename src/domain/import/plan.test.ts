import { describe, expect, it } from "vitest";
import { parseStatement } from "./parse";
import { identify, installmentAnchor, planImport, type ReviewedEntry } from "./plan";

const CARD = "CARTAO-1";

function reviewed(lines: string[], ref: string): ReviewedEntry[] {
  return parseStatement(lines, "card", ref).map((e) => ({ ...e, categoryId: null }));
}

describe("installmentAnchor", () => {
  it("data original da compra é a própria âncora", () => {
    expect(installmentAnchor("2026-07-15", 3, "2026-10")).toBe("2026-07-15");
  });

  it("data da parcela colada no vencimento volta k−1 meses", () => {
    expect(installmentAnchor("2026-09-15", 3, "2026-10")).toBe("2026-07-15");
  });

  it("dia que não existe no mês é grampeado", () => {
    expect(installmentAnchor("2026-05-31", 3, "2026-06")).toBe("2026-03-31");
    expect(installmentAnchor("2026-04-30", 3, "2026-04")).toBe("2026-02-28");
  });
});

describe("identify", () => {
  it("é estável para o mesmo PDF", () => {
    const lines = ["12/09 IFOOD 45,90", "15/07 LOJA 03/10 150,00"];
    const a = identify(reviewed(lines, "2026-10"), {
      paymentMethodId: CARD,
      referenceMonth: "2026-10",
    });
    const b = identify(reviewed(lines, "2026-10"), {
      paymentMethodId: CARD,
      referenceMonth: "2026-10",
    });
    expect(a).toEqual(b);
  });

  it("separa compras idênticas pelo ordinal", () => {
    const ids = identify(reviewed(["12/09 CAFE 5,00", "12/09 CAFE 5,00"], "2026-10"), {
      paymentMethodId: CARD,
      referenceMonth: "2026-10",
    });
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("a parcela da fatura seguinte cai na mesma série", () => {
    const outubro = identify(reviewed(["15/07 LOJA 03/10 150,00"], "2026-10"), {
      paymentMethodId: CARD,
      referenceMonth: "2026-10",
    });
    const novembro = identify(reviewed(["15/07 LOJA 04/10 150,00"], "2026-11"), {
      paymentMethodId: CARD,
      referenceMonth: "2026-11",
    });
    expect(novembro).toEqual(outubro);
  });

  it("mesma série quando o banco imprime a data de cada parcela", () => {
    const outubro = identify(reviewed(["15/09 LOJA 03/10 150,00"], "2026-10"), {
      paymentMethodId: CARD,
      referenceMonth: "2026-10",
    });
    const novembro = identify(reviewed(["15/10 LOJA 04/10 150,00"], "2026-11"), {
      paymentMethodId: CARD,
      referenceMonth: "2026-11",
    });
    expect(novembro).toEqual(outubro);
  });

  it("editar a descrição na revisão não muda o id", () => {
    const entries = reviewed(["12/09 IFOOD 45,90"], "2026-10");
    const ctx = { paymentMethodId: CARD, referenceMonth: "2026-10" };
    const antes = identify(entries, ctx);
    const depois = identify(
      entries.map((e) => ({ ...e, description: "Jantar" })),
      ctx,
    );
    expect(depois).toEqual(antes);
  });
});

describe("planImport", () => {
  const ctx = { paymentMethodId: CARD, referenceMonth: "2026-10" };

  it("avulsa vira transação com a forma de pagamento e a categoria da revisão", () => {
    const [entry] = reviewed(["12/09 IFOOD 45,90"], "2026-10");
    if (entry === undefined) throw new Error("sem linha");
    const plan = planImport([{ ...entry, categoryId: "ALIM", description: "Jantar" }], ctx);
    expect(plan.series).toEqual([]);
    expect(plan.transactions[0]?.draft).toEqual({
      kind: "expense",
      description: "Jantar",
      amountMinor: 4590,
      currency: "BRL",
      categoryId: "ALIM",
      paymentMethodId: CARD,
      cashbackMinor: null,
      occurredOn: "2026-09-12",
      recurrenceId: null,
      occurrenceKey: null,
    });
  });

  it("parcela vira série mensal da 1ª à última parcela", () => {
    const plan = planImport(reviewed(["15/07 LOJA 03/10 150,00"], "2026-10"), ctx);
    expect(plan.transactions).toEqual([]);
    expect(plan.series[0]?.draft).toMatchObject({
      description: "LOJA (10x)",
      amountMinor: 15_000,
      frequency: "monthly",
      scheduleType: "dayOfMonth",
      scheduleN: 15,
      startOn: "2026-07-15",
      endOn: "2027-04-15",
      paymentMethodId: CARD,
    });
  });

  it("linha desmarcada não entra", () => {
    const entries = reviewed(["12/09 IFOOD 45,90"], "2026-10").map((e) => ({
      ...e,
      selected: false,
    }));
    expect(planImport(entries, ctx)).toEqual({ transactions: [], series: [] });
  });
});
