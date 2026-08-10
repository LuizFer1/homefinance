import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

/**
 * `<dialog>` nativo, e não uma div com overlay.
 *
 * O elemento nativo entrega foco preso, Esc para fechar, `inert` no resto da
 * página e o backdrop — tudo sem uma linha de JavaScript e sem dependência, o que
 * importa contra um teto de bundle. Reimplementar foco preso à mão é onde
 * acessibilidade costuma quebrar em silêncio.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;

    // `showModal` lança se já estiver aberto, e `close` num diálogo fechado é
    // no-op mas dispara efeito redundante. Checar `open` evita os dois.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // O equivalente de teclado do clique no backdrop e o Esc, que o <dialog>
    // nativo ja trata e que chega aqui pelo evento `close`. Um onKeyDown seria
    // um segundo caminho para a mesma acao, nao um caminho novo.
    // biome-ignore lint/a11y/useKeyWithClickEvents: ver comentario acima
    <dialog
      ref={ref}
      aria-label={title}
      // O `close` nativo dispara com Esc, e é por ele que o estado externo
      // acompanha o fechamento. Sem isto, fechar com Esc deixaria `open` verdadeiro
      // e o modal não reabriria.
      onClose={onClose}
      // O equivalente de teclado deste clique e o Esc, que o <dialog> nativo ja
      // trata e que chega aqui pelo evento `close` acima. Um onKeyDown seria um
      // segundo caminho para a mesma acao, nao um caminho novo.
      onClick={(event) => {
        // Clique no backdrop: o alvo é o próprio dialog só quando o clique caiu
        // fora do conteúdo, porque o conteúdo é um filho.
        if (event.target === ref.current) onClose();
      }}
      class="hf-sheet m-0 mt-auto w-full max-w-md bg-transparent p-0 backdrop:bg-black/40
        sm:m-auto sm:w-[calc(100%-2rem)]"
    >
      <div class="rounded-box max-h-[85dvh] overflow-y-auto bg-base-100 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </dialog>
  );
}
