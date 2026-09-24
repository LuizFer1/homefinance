import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../icons/icon";

/** Quanto o dedo fica no botão antes de a exclusão disparar. Exportado para o teste. */
export const HOLD_MS = 2000;

/**
 * Toque captura o ponteiro no alvo por padrão, e com captura o `pointerleave`
 * nunca dispara: arrastar o dedo para fora deixaria de cancelar — justamente o
 * único jeito de desistir depois de ter começado a segurar.
 *
 * O encadeamento opcional é por causa do `happy-dom`, que não implementa a API.
 */
function releaseCapture(target: HTMLElement, pointerId: number) {
  if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
}

export interface HoldToDeleteProps {
  /** "Excluir Mercado" — a instrução de segurar é anexada ao nome acessível. */
  label: string;
  onConfirm: () => void;
}

/**
 * Lixeira 36×36 que exclui só depois de segurar.
 *
 * Excluir é a única ação sem desfazer do app: o log é append-only e o evento de
 * delete nasce eterno. O redesign tirou a lixeira de cada linha e a trouxe para
 * o sheet de edição, mas manteve o segurar — um toque só, ao lado do "Fechar",
 * seria o mesmo escorregão permanente de antes, em outro lugar.
 *
 * O preenchimento que sobe é a leitura de quanto falta, e é o que permite
 * desistir no meio. Por isso ele tem recorte próprio no bloco de movimento
 * reduzido do `app.css`.
 */
export function HoldToDelete({ label, onConfirm }: HoldToDeleteProps) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  function cancel() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  }

  function start() {
    // O teclado repete `keydown` enquanto a tecla desce; sem a guarda, cada
    // repetição reiniciaria o cronômetro e segurar nunca chegaria ao fim.
    if (timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  }

  // Confirmar desmonta o sheet. Sem a limpeza, um hold interrompido por outro
  // motivo deixaria um timer vivo mirando um componente morto.
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  return (
    <button
      type="button"
      // A instrução entra no nome acessível porque ela **é** a interação: um
      // botão que só diz "Excluir" e não responde ao clique lê como quebrado.
      aria-label={`${label} (segure para confirmar)`}
      title="Segure para excluir"
      data-holding={holding ? "true" : undefined}
      onPointerDown={(event) => {
        releaseCapture(event.currentTarget, event.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onBlur={cancel}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        // Sem isto o Espaço rola a página enquanto o usuário segura o botão.
        event.preventDefault();
        start();
      }}
      onKeyUp={cancel}
      class="hf-hold hf-press grid size-9 shrink-0 select-none place-items-center rounded-lg
        bg-expense/[0.12] text-expense-fg shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-expense)_35%,transparent)]"
    >
      {/* `relative` para o ícone pintar acima do preenchimento, e não sob ele. */}
      <Icon name="trash" size={18} class="relative" />
    </button>
  );
}
