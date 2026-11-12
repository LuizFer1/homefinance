import { describe, expect, it } from "vitest";
import { ACCOUNT_IDS } from "./accounts.fake";
import { HELP_STRUCTURE, HELP_TEXT_PT, HELP_TOPIC_LABELS_PT, HELP_TOPICS } from "./content";
import { PHASE_3_IDS } from "./phase-3.fake";

describe("conteúdo da ajuda", () => {
  it("todo id da estrutura tem texto, e nenhum texto está órfão", () => {
    const ids = HELP_STRUCTURE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(HELP_TEXT_PT).sort()).toEqual([...ids].sort());
  });

  it("todo tema tem ao menos uma pergunta", () => {
    for (const topic of HELP_TOPICS) {
      expect(HELP_STRUCTURE.some((entry) => entry.topic === topic)).toBe(true);
    }
  });

  it("as perguntas da Fase 3 existem, cada uma no tema certo", () => {
    const topicOf = new Map(HELP_STRUCTURE.map((entry) => [entry.id, entry.topic]));
    expect(PHASE_3_IDS.map((id) => topicOf.get(id))).toEqual([
      "privacy",
      "privacy",
      "dashboard",
      "cards",
      "cards",
      "cards",
      "cards",
      "cards",
      "start",
      "start",
      "import",
    ]);
  });

  it("o tema da conta comercial cobre o que é, como criar, como trocar, o isolamento e a atualização", () => {
    expect(HELP_TOPIC_LABELS_PT.accounts).toBe("Conta comercial");
    const entries = HELP_STRUCTURE.filter((entry) => entry.topic === "accounts");
    expect(entries.map((entry) => entry.id)).toEqual([...ACCOUNT_IDS]);

    const text = (id: string) => (HELP_TEXT_PT[id]?.answer ?? []).join(" ");
    expect(text("accounts-create")).toContain("ícone de loja");
    expect(text("accounts-switch")).toContain("volta à pessoal");
    expect(text("accounts-separate")).toContain("nunca somam");
    expect(text("accounts-update-first")).toContain("todos os aparelhos e o hub");
  });
});
