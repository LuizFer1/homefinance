import { describe, expect, it } from "vitest";
import { reserveBalance, savedInMonth } from "../reserves/balances";
import { filterByMonth } from "./breakdown";
import { GRAFITE_TODAY, grafiteState, occurrenceIdOf, RE, UG, UL } from "./grafite.fake";
import { listTransactions, totals } from "./selectors";

/**
 * Sanidade da fixture da spec §3.1: se um destes números mudar, a tabela 3.2
 * inteira (e a mesma fixture no hub) deixa de valer.
 */
const all = () => listTransactions(grafiteState());
const sum = (rows: { amountMinor: number }[]) => rows.reduce((acc, r) => acc + r.amountMinor, 0);

describe("fixture grafite", () => {
  it("hoje é 19 de novembro de 2026", () => {
    expect(GRAFITE_TODAY).toBe("2026-11-19");
  });

  it("novembro fecha em 350000 de receita e 311341 de despesa", () => {
    const t = totals(filterByMonth(all(), "2026-11"));
    expect(t.incomeMinor).toBe(350_000);
    expect(t.expenseMinor).toBe(311_341);
  });

  it("outubro fecha em 507229 de receita e 366200 de despesa", () => {
    const t = totals(filterByMonth(all(), "2026-10"));
    expect(t.incomeMinor).toBe(507_229);
    expect(t.expenseMinor).toBe(366_200);
  });

  it("outubro acumula 270500 de despesa até o dia 19", () => {
    const upTo19 = filterByMonth(all(), "2026-10").filter((r) => r.occurredOn <= "2026-10-19");
    expect(totals(upTo19).expenseMinor).toBe(270_500);
  });

  it("novembro: fixa 87600 e avulso 223741", () => {
    const expenses = filterByMonth(all(), "2026-11").filter((r) => r.kind === "expense");
    expect(sum(expenses.filter((r) => r.recurrenceId !== null))).toBe(87_600);
    expect(sum(expenses.filter((r) => r.recurrenceId === null))).toBe(223_741);
  });

  it("novembro por categoria", () => {
    const state = grafiteState();
    const byName = new Map<string, number>();
    for (const r of filterByMonth(all(), "2026-11")) {
      if (r.kind !== "expense" || r.categoryId === null) continue;
      const name = state.categories[r.categoryId]?.name ?? "?";
      byName.set(name, (byName.get(name) ?? 0) + r.amountMinor);
    }
    expect(Object.fromEntries(byName)).toEqual({
      Compras: 51_515,
      Conforto: 39_436,
      Assinaturas: 16_837,
      Contas: 53_901,
      Mercado: 108_934,
      Sogrinha: 17_490,
      Manutenção: 10_728,
      Pets: 7_500,
      Transporte: 5_000,
    });
  });

  it("quem lançou em novembro: UL 264041 e UG 47300", () => {
    const expenses = filterByMonth(all(), "2026-11").filter((r) => r.kind === "expense");
    expect(sum(expenses.filter((r) => r.userId === UL))).toBe(264_041);
    expect(sum(expenses.filter((r) => r.userId === UG))).toBe(47_300);
  });

  it("as compras de Compras de novembro estão todas no cartão PMP", () => {
    const onCard = filterByMonth(all(), "2026-11").filter((r) => r.paymentMethodId === "PMP");
    expect(sum(onCard)).toBe(51_515);
  });

  it("reserva de emergência: 35000 guardados, 20000 saíram em novembro", () => {
    const state = grafiteState();
    expect(reserveBalance(state, RE)).toBe(35_000);
    expect(savedInMonth(state, "2026-11")).toBe(-20_000);
  });

  it("Últimos lançamentos começam por Claude code, Almoço, Jantinha", () => {
    expect(
      all()
        .slice(0, 3)
        .map((r) => r.description),
    ).toEqual(["Claude code", "Almoço", "Jantinha"]);
  });

  // Ids colados na fixture Rust: o hub deduplica a ocorrência por eles.
  it("ids das ocorrências", () => {
    expect({
      "RSAL:2026-11": occurrenceIdOf("RSAL", "2026-11"),
      "RCON:2026-11": occurrenceIdOf("RCON", "2026-11"),
      "RPRI:2026-11": occurrenceIdOf("RPRI", "2026-11"),
      "RMEL:2026-11": occurrenceIdOf("RMEL", "2026-11"),
      "RCLA:2026-11": occurrenceIdOf("RCLA", "2026-11"),
      "RSPO:2026-11": occurrenceIdOf("RSPO", "2026-11"),
      "RSOG:2026-11": occurrenceIdOf("RSOG", "2026-11"),
      "RCAD:2026-10": occurrenceIdOf("RCAD", "2026-10"),
      "RCAD:2026-11": occurrenceIdOf("RCAD", "2026-11"),
    }).toEqual({
      "RSAL:2026-11": "7748FB44FQCR7BWM7Q4RFV4MF7",
      "RCON:2026-11": "FBCWZFMRQBMWQZCRFVCCZZM8QV",
      "RPRI:2026-11": "32AZFJ67VJJFQ2Y7K2TZZJP7BJ",
      "RMEL:2026-11": "VSRJZHCTV1RTF9CJV9R2Z1CAVH",
      "RCLA:2026-11": "FDMP3D8PZN4YK58EFXM63X86Z5",
      "RSPO:2026-11": "K7803KGMV7GGBKRMKQ8G33G4VQ",
      "RSOG:2026-11": "Q461Z06XFME170YX74P1F0PXZM",
      "RCAD:2026-10": "ZWY97REN7CP9ZRPNFWE9QRYNQC",
      "RCAD:2026-11": "QZM0FK4WFZC0Q3CWQFMGF34CFF",
    });
    // A de 21/11 vence depois de hoje: ainda não gravada.
    expect(grafiteState().transactions[occurrenceIdOf("RCAD", "2026-11")]).toBeUndefined();
  });
});
