import { normalizeDescription } from "../../domain/import/suggest-category";
import {
  HELP_STRUCTURE,
  HELP_TEXT_PT,
  HELP_TOPIC_LABELS_PT,
  type HelpEntryShape,
  type HelpTopic,
} from "./content";

export interface HelpEntry extends HelpEntryShape {
  question: string;
  answer: readonly string[];
  /** Pergunta, resposta e tema já normalizados: a busca vira `includes`, sem refazer o trabalho a cada tecla. */
  haystack: string;
  /** Só a pergunta normalizada, para ela pesar mais que o corpo. */
  title: string;
}

/**
 * Junta estrutura e texto. Uma chave sem texto (o dicionário de um idioma novo
 * ainda incompleto) é pulada em vez de quebrar a tela inteira.
 */
export function buildHelpEntries(
  structure: readonly HelpEntryShape[] = HELP_STRUCTURE,
  text: Record<string, { question: string; answer: readonly string[] }> = HELP_TEXT_PT,
  topicLabels: Record<HelpTopic, string> = HELP_TOPIC_LABELS_PT,
): HelpEntry[] {
  const entries: HelpEntry[] = [];
  for (const shape of structure) {
    const copy = text[shape.id];
    if (copy === undefined) continue;
    entries.push({
      ...shape,
      ...copy,
      title: normalizeDescription(copy.question),
      haystack: normalizeDescription(
        `${copy.question} ${copy.answer.join(" ")} ${topicLabels[shape.topic]}`,
      ),
    });
  }
  return entries;
}

/**
 * Busca sem acento nem caixa, no texto inteiro. Todas as palavras da consulta
 * precisam aparecer (E, em qualquer ordem): "reserva retirar" acha a resposta
 * que fala das duas coisas, mesmo em frases diferentes.
 *
 * A consulta passa por `normalizeDescription`, o mesmo que o resto do app usa
 * para comparar texto, então "Alimentação" e "ALIMENTACAO" são a mesma coisa.
 * Resultado: perguntas que casam no título primeiro, depois as do corpo, cada
 * grupo na ordem do conteúdo. Consulta vazia devolve tudo.
 */
export function searchHelp(entries: readonly HelpEntry[], query: string): HelpEntry[] {
  const terms = normalizeDescription(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [...entries];
  const hits = entries.filter((entry) => terms.every((term) => entry.haystack.includes(term)));
  const inTitle = hits.filter((entry) => terms.every((term) => entry.title.includes(term)));
  return [...inTitle, ...hits.filter((entry) => !inTitle.includes(entry))];
}
