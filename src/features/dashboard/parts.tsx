import type { ComponentChildren } from "preact";
import { monthLabelLong } from "../../domain/projections/periods";
import { Icon } from "../icons/icon";

/** Nome do mês sem o ano ("agosto"), para as frases de comparação. */
export function monthWord(month: string): string {
  return monthLabelLong(month).split(" ")[0] ?? "";
}

export interface BlockProps {
  /** A pergunta que o bloco responde: "Como estou", "Para onde foi", "O que vem". */
  title: string;
  aside?: ComponentChildren;
  children: ComponentChildren;
}

/**
 * Um dos três blocos do Resumo. O título fica **fora** do card: com ele dentro,
 * cada card tinha o mesmo peso e a tela lia como nove coisas soltas em vez de
 * três perguntas.
 */
export function Block({ title, aside, children }: BlockProps) {
  return (
    <section aria-label={title}>
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-base font-medium">{title}</h2>
        {aside !== undefined && <span class="text-xs text-fg/55">{aside}</span>}
      </div>
      <div class="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export interface TextLinkProps {
  onClick: () => void;
  children: ComponentChildren;
  /** Seta à direita: "abre uma lista", e não "sai da tela". */
  caret?: boolean;
}

/**
 * Link de texto no rodapé de um card ("Ver todas as 8", "Ver orçamento").
 * `min-h-11` porque o texto tem 20px de altura e o dedo precisa de 44.
 */
export function TextLink({ onClick, children, caret = false }: TextLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      class="hf-press inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent-300"
    >
      {children}
      {caret && <Icon name="caret-right" size={16} />}
    </button>
  );
}
