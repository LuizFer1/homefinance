import { describe, expect, it } from "vitest";
import { buildHelpEntries, searchHelp } from "./search";

const entries = buildHelpEntries();
const ids = (query: string) => searchHelp(entries, query).map((entry) => entry.id);

describe("searchHelp", () => {
  it("consulta vazia devolve tudo, na ordem do conteúdo", () => {
    expect(ids("  ")).toEqual(entries.map((entry) => entry.id));
  });

  it("ignora acento e caixa", () => {
    expect(ids("ORCAMENTO")).toEqual(ids("orçamento"));
    expect(ids("orçamento")).toContain("budgets-set");
  });

  it("acha pelo texto do corpo, não só pela pergunta", () => {
    // "dia útil" só aparece na resposta da recorrência.
    expect(ids("dia util")).toContain("recurrence-create");
    expect(ids("CPF")).toContain("import-password");
  });

  it("exige todas as palavras, em qualquer ordem", () => {
    expect(ids("retirar reserva")).toContain("reserves-move");
    expect(ids("retirar zzzxyz")).toEqual([]);
  });

  it("pergunta que casa no título vem antes da que casa só no corpo", () => {
    const inTitle = searchHelp(entries, "hub").map((entry) => entry.title.includes("HUB"));
    expect(inTitle).toContain(true);
    expect(inTitle).toContain(false);
    expect(inTitle).toEqual([...inTitle].sort((a, b) => Number(b) - Number(a)));
  });

  it("acha as respostas da Fase 3 pelo texto do corpo", () => {
    expect(ids("homefinance json")).toContain("privacy-export");
    expect(ids("quatro degraus")).toContain("dashboard-heatmap");
    expect(ids("outros cartoes")).toContain("cards-home-bar");
    expect(ids("estimativa fechamento")).toContain("cards-invoices");
    expect(ids("exportar dados antes")).toContain("cards-migration");
    expect(ids("transferencia duas vezes")).toContain("cards-pay-invoice");
    expect(ids("dispensar sugestao")).toContain("start-category-suggestion");
    expect(ids("uber trip")).toContain("start-apply-similar");
    expect(ids("formato desconhecido")).toContain("import-summary");
    expect(ids("ver resumo")).toContain("import-summary");
  });

  it("pula chave sem texto em vez de quebrar", () => {
    const partial = buildHelpEntries([{ id: "x", topic: "start" }], {});
    expect(partial).toEqual([]);
  });
});
