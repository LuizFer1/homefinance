import { describe, expect, it } from "vitest";
import { HELP_STRUCTURE, HELP_TEXT_PT, HELP_TOPICS } from "./content";
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
});
