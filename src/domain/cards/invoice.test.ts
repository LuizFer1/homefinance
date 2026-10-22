import { describe, expect, it } from "vitest";
import { DELETED_AT } from "../model/row.fake";
import { card, legacyCard, purchase, world } from "./fixtures.fake";
import { cardInvoices, invoiceDates, invoiceMonthOf } from "./invoice";

describe("invoiceMonthOf", () => {
  it("compra antes do fechamento fica na fatura que fecha no mês", () => {
    expect(invoiceMonthOf("2026-10-03", 5)).toBe("2026-10");
  });

  it("compra no dia do fechamento fica na fatura que fecha naquele dia", () => {
    expect(invoiceMonthOf("2026-10-05", 5)).toBe("2026-10");
  });

  it("compra depois do fechamento vai para a fatura do mês seguinte", () => {
    expect(invoiceMonthOf("2026-10-06", 5)).toBe("2026-11");
  });

  it("virada de ano: depois do fechamento de dezembro cai em janeiro do ano seguinte", () => {
    expect(invoiceMonthOf("2026-12-20", 10)).toBe("2027-01");
    expect(invoiceMonthOf("2026-12-10", 10)).toBe("2026-12");
    expect(invoiceMonthOf("2027-01-02", 10)).toBe("2027-01");
  });

  it("fechamento no 31 em mês curto vale o último dia", () => {
    // Fevereiro de 2027 tem 28 dias: o dia 28 já é o fechamento.
    expect(invoiceMonthOf("2027-02-28", 31)).toBe("2027-02");
    expect(invoiceMonthOf("2027-03-01", 31)).toBe("2027-03");
    // Ano bissexto: o dia 29 fecha, e o 28 ainda é antes.
    expect(invoiceMonthOf("2028-02-28", 31)).toBe("2028-02");
    expect(invoiceMonthOf("2028-02-29", 31)).toBe("2028-02");
    expect(invoiceMonthOf("2028-03-01", 31)).toBe("2028-03");
  });

  it("fechamento no 30 em fevereiro também usa o último dia", () => {
    expect(invoiceMonthOf("2027-02-28", 30)).toBe("2027-02");
  });
});

describe("invoiceDates", () => {
  it("vencimento depois do fechamento fica no mesmo mês", () => {
    expect(invoiceDates("2026-10", 5, 12)).toEqual({ closesOn: "2026-10-05", dueOn: "2026-10-12" });
  });

  it("vencimento menor que o fechamento cai no mês seguinte", () => {
    expect(invoiceDates("2026-10", 25, 5)).toEqual({ closesOn: "2026-10-25", dueOn: "2026-11-05" });
  });

  it("vencimento no mesmo dia do fechamento também vai para o mês seguinte", () => {
    expect(invoiceDates("2026-10", 10, 10)).toEqual({
      closesOn: "2026-10-10",
      dueOn: "2026-11-10",
    });
  });

  it("virada de ano: fatura de dezembro vence em janeiro", () => {
    expect(invoiceDates("2026-12", 25, 5)).toEqual({ closesOn: "2026-12-25", dueOn: "2027-01-05" });
  });

  it("mês curto limita fechamento e vencimento ao último dia", () => {
    expect(invoiceDates("2027-02", 31, 30)).toEqual({
      closesOn: "2027-02-28",
      dueOn: "2027-03-30",
    });
    expect(invoiceDates("2027-01", 20, 31)).toEqual({
      closesOn: "2027-01-20",
      dueOn: "2027-01-31",
    });
    // Vencimento 30 num mês de 30 dias, e 31 num mês de 30 dias.
    expect(invoiceDates("2026-04", 10, 31)).toEqual({
      closesOn: "2026-04-10",
      dueOn: "2026-04-30",
    });
  });
});

describe("cardInvoices", () => {
  const nu = card("nu", { closingDay: 5, dueDay: 12 });

  it("separa a fatura aberta das anteriores", () => {
    const state = world({
      methods: [nu],
      transactions: [
        purchase("a", "nu", "2026-09-20", 10_000),
        purchase("b", "nu", "2026-10-02", 2_500),
        purchase("c", "nu", "2026-10-06", 4_000),
      ],
    });

    const invoices = cardInvoices(state, nu, "2026-10-10");

    // Hoje (dia 10, depois do fechamento do dia 5) está na fatura que fecha em novembro.
    expect(invoices.map((i) => [i.month, i.status, i.totalMinor])).toEqual([
      ["2026-11", "open", 4_000],
      ["2026-10", "closed", 12_500],
    ]);
    expect(invoices[0]).toMatchObject({ closesOn: "2026-11-05", dueOn: "2026-11-12" });
  });

  it("antes do fechamento a fatura aberta é a que fecha neste mês", () => {
    const state = world({ methods: [nu], transactions: [purchase("a", "nu", "2026-10-02")] });

    const [open] = cardInvoices(state, nu, "2026-10-04");

    expect(open).toMatchObject({ month: "2026-10", status: "open", totalMinor: 1_000 });
  });

  it("no próprio dia do fechamento a fatura ainda está aberta", () => {
    const [open] = cardInvoices(world({ methods: [nu] }), nu, "2026-10-05");
    expect(open).toMatchObject({ month: "2026-10", status: "open" });
  });

  it("a fatura aberta aparece mesmo sem compra", () => {
    const invoices = cardInvoices(world({ methods: [nu] }), nu, "2026-10-10");
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ status: "open", totalMinor: 0, items: [] });
  });

  it("só soma o que é do cartão e conta nos totais", () => {
    const state = world({
      methods: [nu, card("outro")],
      transactions: [
        purchase("a", "nu", "2026-10-02", 1_000),
        purchase("outro", "outro", "2026-10-02", 9_000),
        purchase("transf", "nu", "2026-10-02", 7_000, { reportState: "transfer" }),
        purchase("oculta", "nu", "2026-10-02", 6_000, { reportState: "hidden" }),
        purchase("apagada", "nu", "2026-10-02", 5_000, { deletedAt: DELETED_AT }),
        purchase("sem", null, "2026-10-02", 4_000),
      ],
    });

    const [open] = cardInvoices(state, nu, "2026-10-04");

    expect(open?.items.map((i) => i.id)).toEqual(["a"]);
    expect(open?.totalMinor).toBe(1_000);
  });

  it("estorno no cartão abate a fatura", () => {
    const state = world({
      methods: [nu],
      transactions: [
        purchase("a", "nu", "2026-10-02", 10_000),
        purchase("estorno", "nu", "2026-10-03", 2_500, { kind: "income" }),
      ],
    });

    const [open] = cardInvoices(state, nu, "2026-10-04");

    expect(open?.totalMinor).toBe(7_500);
  });

  it("virada de ano: compra de dezembro depois do fechamento entra na fatura de janeiro", () => {
    const state = world({
      methods: [nu],
      transactions: [purchase("a", "nu", "2026-12-28", 3_000), purchase("b", "nu", "2027-01-03")],
    });

    const invoices = cardInvoices(state, nu, "2027-01-04");

    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ month: "2027-01", totalMinor: 4_000 });
    expect(invoices[0]?.dueOn).toBe("2027-01-12");
  });

  it("lista os lançamentos do mais recente para o mais antigo", () => {
    const state = world({
      methods: [nu],
      transactions: [purchase("a", "nu", "2026-10-01"), purchase("b", "nu", "2026-10-03")],
    });

    const [open] = cardInvoices(state, nu, "2026-10-04");

    expect(open?.items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("cartão por completar não tem fatura", () => {
    const old = legacyCard("velho");
    const state = world({ methods: [old], transactions: [purchase("a", "velho", "2026-10-02")] });
    expect(cardInvoices(state, old, "2026-10-04")).toEqual([]);
  });

  it("dia inválido vindo de outra versão degrada para cartão por completar", () => {
    const strange = card("estranho", { closingDay: 45 });
    expect(cardInvoices(world({ methods: [strange] }), strange, "2026-10-04")).toEqual([]);
  });
});
