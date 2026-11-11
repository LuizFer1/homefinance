import type { ComponentChildren } from "preact";
import { Modal, SheetHeader } from "../ui/modal";

export interface ListSheetProps {
  open: boolean;
  title: string;
  /** Linha de contexto sob o título ("próximos 30 dias"). */
  note?: string;
  onClose: () => void;
  children: ComponentChildren;
}

/**
 * Sheet de consulta do Resumo: a lista inteira que o bloco resumiu, o
 * calendário, a série de seis meses.
 *
 * Uma etapa só, pelo mesmo motivo do `DaySheet`: é leitura, não formulário nem
 * ação que mude dados — a regra de várias etapas vale para esses.
 *
 * O corpo só existe aberto. Fechado, o `<dialog>` continua no DOM, e a lista
 * inteira ficaria duplicada na árvore (e nas buscas do leitor de tela e dos
 * testes) ao lado do resumo que a página já mostra.
 */
export function ListSheet({ open, title, note, onClose, children }: ListSheetProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <SheetHeader title={title} onClose={onClose} />
      {open && (
        <>
          {note !== undefined && <p class="mt-1 text-sm text-fg/60">{note}</p>}
          <div class="mt-4">{children}</div>
        </>
      )}
    </Modal>
  );
}
