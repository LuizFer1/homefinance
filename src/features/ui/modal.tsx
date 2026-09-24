import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../icons/icon";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

/** Quanto o sheet precisa descer pelo grabber para fechar ao soltar. */
export const DRAG_CLOSE_PX = 96;

/**
 * Bottom sheet sobre `<dialog>` nativo, e não uma div com overlay.
 *
 * O elemento nativo entrega foco preso, Esc para fechar, `inert` no resto da
 * página e o backdrop — sem uma linha de JavaScript e sem dependência. Por cima
 * dele o handoff pede só duas coisas: o grabber e arrastar por ele para fechar.
 *
 * O arraste mora **só no grabber**, não no sheet inteiro: o conteúdo rola, e um
 * gesto vertical no corpo teria que adivinhar se o dedo queria rolar ou fechar.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const start = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;

    // `showModal` lança se já estiver aberto, e `close` num diálogo fechado é
    // no-op mas dispara efeito redundante. Checar `open` evita os dois.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) setDrag(0);
  }, [open]);

  function onDown(event: PointerEvent) {
    start.current = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function onMove(event: PointerEvent) {
    if (start.current === null) return;
    // Só para baixo: puxar para cima não tem para onde ir.
    setDrag(Math.max(0, event.clientY - start.current));
  }

  function onUp() {
    if (start.current === null) return;
    start.current = null;
    if (drag > DRAG_CLOSE_PX) onClose();
    else setDrag(0);
  }

  return (
    // O equivalente de teclado do clique no backdrop é o Esc, que o <dialog>
    // nativo já trata e que chega aqui pelo evento `close`.
    // biome-ignore lint/a11y/useKeyWithClickEvents: ver comentário acima
    <dialog
      ref={ref}
      aria-label={title}
      // Foco inicial no próprio diálogo, e não no primeiro botão: sem isto o
      // `showModal` focava a lixeira da edição e ela abria com anel de foco,
      // a um Enter de distância de começar a excluir.
      autofocus
      // O `close` nativo dispara com Esc, e é por ele que o estado externo
      // acompanha o fechamento. Sem isto, fechar com Esc deixaria `open`
      // verdadeiro e o modal não reabriria.
      onClose={onClose}
      onClick={(event) => {
        // Clique no backdrop: o alvo é o próprio dialog só quando o clique caiu
        // fora do conteúdo, porque o conteúdo é um filho.
        if (event.target === ref.current) onClose();
      }}
      data-dragging={start.current !== null ? "true" : undefined}
      style={{ "--hf-drag": `${drag}px` }}
      class="hf-sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 text-fg
        sm:mx-auto sm:max-w-md"
    >
      <div
        class="max-h-[92dvh] overflow-y-auto rounded-t-[20px] bg-surface px-5
          pb-[max(1.5rem,env(safe-area-inset-bottom))]
          shadow-[0_0_0_1px_var(--color-neutral-800),0_-16px_40px_rgba(0,0,0,.5)]"
      >
        <div
          aria-hidden="true"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          class="sticky top-0 z-10 -mx-5 flex cursor-grab touch-none justify-center bg-surface
            pt-2.5 pb-3.5"
        >
          <span class="h-1 w-9 rounded-full bg-neutral-700" />
        </div>
        {children}
      </div>
    </dialog>
  );
}

export interface SheetHeaderProps {
  title: string;
  onClose: () => void;
  /** Ações antes do fechar (a lixeira da edição). */
  actions?: ComponentChildren;
}

/** Cabeçalho do sheet: título 18/500 e fechar 36×36. */
export function SheetHeader({ title, onClose, actions }: SheetHeaderProps) {
  return (
    <div class="flex items-center gap-2">
      <h2 class="min-w-0 flex-1 truncate text-lg font-medium">{title}</h2>
      {actions}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        class="hf-press grid size-9 place-items-center rounded-lg bg-fg/[0.06] text-fg/80
          hover:bg-fg/[0.1]"
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
