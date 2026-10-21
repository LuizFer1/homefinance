import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Icon } from "../icons/icon";
import { FIELD_PAGE } from "../ui/field";
import { PageHeader } from "../ui/page-header";
import { HELP_TOPIC_LABELS_PT, HELP_TOPICS } from "./content";
import { helpLink, pendingHelp } from "./deep-link";
import { buildHelpEntries, type HelpEntry, searchHelp } from "./search";

export interface HelpPageProps {
  onBack: () => void;
}

function QuestionRow({
  entry,
  open,
  onToggle,
  showTopic,
}: {
  entry: HelpEntry;
  open: boolean;
  onToggle: () => void;
  showTopic: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [copied, setCopied] = useState(false);

  // Aberta por link: traz a pergunta para a vista. `scrollIntoView` não existe
  // em todo ambiente de teste, daí a guarda.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  async function copyLink() {
    const url = `${location.origin}${location.pathname}${helpLink(entry.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sem permissão de área de transferência: o link continua acessível
      // abrindo a pergunta e copiando da barra, então não há erro a mostrar.
      setCopied(false);
    }
  }

  return (
    <li ref={ref} id={`ajuda-${entry.id}`} class="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`resposta-${entry.id}`}
        onClick={onToggle}
        class="hf-press flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-fg/[0.04]"
      >
        <span class="min-w-0 flex-1">
          {showTopic && (
            <span class="hf-label mb-0.5 block">{HELP_TOPIC_LABELS_PT[entry.topic]}</span>
          )}
          <span class="block text-[15px] leading-snug">{entry.question}</span>
        </span>
        <Icon
          name="caret-down"
          size={16}
          class={`shrink-0 text-fg/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div id={`resposta-${entry.id}`} class="px-4 pb-4">
          {entry.answer.map((paragraph) => (
            <p key={paragraph} class="mt-2 text-sm leading-relaxed text-fg/75 text-pretty">
              {paragraph}
            </p>
          ))}
          <button
            type="button"
            onClick={() => void copyLink()}
            class="hf-press mt-3 flex h-9 items-center gap-1.5 rounded-md pr-2 text-sm text-accent-300"
          >
            <Icon name="arrow-up-right" size={14} />
            <span role="status">{copied ? "Link copiado" : "Copiar link desta pergunta"}</span>
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Ajuda embutida: perguntas e respostas agrupadas por tema, com busca no texto
 * inteiro. O conteúdo é estático e vem no pacote do app, então abre sem rede.
 *
 * É uma tela de leitura, não um formulário: a regra de formulários em etapas
 * (Modal, Progress, prévia) não se aplica. O único campo é a busca, que filtra
 * a lista na hora e não grava nada.
 */
export function HelpPage({ onBack }: HelpPageProps) {
  const entries = useMemo(() => buildHelpEntries(), []);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Pedido de link: abre a pergunta e zera o sinal. Sem zerar, voltar para a
  // Ajuda depois reabriria a mesma pergunta. Lido do sinal (e não de uma prop)
  // para valer também quando o link chega com a Ajuda já aberta.
  const requested = pendingHelp.value;
  useEffect(() => {
    if (requested === null) return;
    setQuery("");
    setOpenId(requested === "" ? null : requested);
    pendingHelp.value = null;
  }, [requested]);

  const searching = query.trim() !== "";
  const results = useMemo(() => searchHelp(entries, query), [entries, query]);

  function row(entry: HelpEntry, showTopic: boolean) {
    return (
      <QuestionRow
        key={entry.id}
        entry={entry}
        open={openId === entry.id}
        showTopic={showTopic}
        onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
      />
    );
  }

  return (
    <section aria-label="Ajuda">
      <PageHeader title="Ajuda" onBack={onBack} />
      <p class="mt-2 text-sm text-fg/55">Funciona sem internet. Nada daqui sai do aparelho.</p>

      <div class="relative mt-4">
        <Icon
          name="magnifying-glass"
          size={16}
          class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg/50"
        />
        <input
          type="search"
          aria-label="Buscar na ajuda"
          placeholder="Buscar na ajuda"
          autocomplete="off"
          class={`${FIELD_PAGE} pl-10`}
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {searching ? (
        <section aria-label="Resultados da busca" class="mt-4">
          <p role="status" class="text-[13px] text-fg/55">
            {results.length === 0
              ? "Nenhuma pergunta encontrada. Tente outra palavra."
              : results.length === 1
                ? "1 pergunta encontrada"
                : `${results.length} perguntas encontradas`}
          </p>
          {results.length > 0 && (
            <ul class="mt-2 divide-y divide-divider overflow-hidden rounded-lg bg-surface">
              {results.map((entry) => row(entry, true))}
            </ul>
          )}
        </section>
      ) : (
        HELP_TOPICS.map((topic) => {
          const rows = entries.filter((entry) => entry.topic === topic);
          if (rows.length === 0) return null;
          const label = HELP_TOPIC_LABELS_PT[topic];
          return (
            <section key={topic} aria-label={label} class="mt-6">
              <h2 class="hf-label">{label}</h2>
              <ul class="mt-2.5 divide-y divide-divider overflow-hidden rounded-lg bg-surface">
                {rows.map((entry) => row(entry, false))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}
