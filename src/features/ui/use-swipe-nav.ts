import { useCallback, useRef, useState } from "preact/hooks";
import {
  adjacentScreen,
  dragOffsetPx,
  lockAxis,
  resolveSwipe,
  type SwipeDirection,
} from "./swipe-nav";

export interface UseSwipeNavOptions<T extends string> {
  screens: readonly T[];
  screen: T;
  /** Falso em modal, sub-tela de Ajustes, etc. — o gesto some sem estragar scroll. */
  enabled: boolean;
  onChange: (id: T) => void;
}

export interface SwipeNavBind {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  /** Marca a superfície para CSS (`touch-action`, transição). */
  "data-swiping"?: "true";
  style?: { transform: string; transition?: string };
}

/**
 * Arraste horizontal entre abas sem bloquear o scroll vertical.
 *
 * Trava o eixo depois de ~10px: se o gesto for vertical, abandona e deixa a
 * página rolar. Se for horizontal, captura o ponteiro e desloca o conteúdo
 * com o dedo até soltar (commit ou volta).
 *
 * Só o ponteiro primário conta — multi-toque no meio do arraste saltaria a
 * posição e o usuário perderia o controle.
 */
export function useSwipeNav<T extends string>({
  screens,
  screen,
  enabled,
  onChange,
}: UseSwipeNavOptions<T>): SwipeNavBind {
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const session = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    axis: "horizontal" | "vertical" | null;
    deltaX: number;
  } | null>(null);

  const canPrev = adjacentScreen(screens, screen, "prev") !== null;
  const canNext = adjacentScreen(screens, screen, "next") !== null;

  const endSession = useCallback((target: HTMLElement | null, pointerId: number) => {
    if (target?.hasPointerCapture?.(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    session.current = null;
    setOffset(0);
    setSwiping(false);
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (!enabled) return;
      // Só o primeiro dedo / botão principal. Outros pontos no meio do arraste
      // fariam o delta saltar para a nova coordenada.
      if (!event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      session.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTime: performance.now(),
        axis: null,
        deltaX: 0,
      };
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const s = session.current;
      if (s === null || event.pointerId !== s.pointerId) return;

      const dx = event.clientX - s.startX;
      const dy = event.clientY - s.startY;

      if (s.axis === null) {
        const axis = lockAxis(dx, dy);
        if (axis === null) return;
        s.axis = axis;
        if (axis === "vertical") {
          // Scroll vertical: solta a sessão e não mexe no transform.
          session.current = null;
          return;
        }
        // Horizontal: captura para continuar recebendo moves fora do alvo.
        (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
        setSwiping(true);
      }

      if (s.axis !== "horizontal") return;

      s.deltaX = dx;
      setOffset(dragOffsetPx(dx, canPrev, canNext));
    },
    [canPrev, canNext],
  );

  const finish = useCallback(
    (event: PointerEvent) => {
      const s = session.current;
      if (s === null || event.pointerId !== s.pointerId) return;

      const target = event.currentTarget as HTMLElement | null;
      const wasHorizontal = s.axis === "horizontal";
      const deltaX = s.deltaX;
      const elapsed = performance.now() - s.startTime;

      endSession(target, s.pointerId);

      if (!wasHorizontal || !enabled) return;

      const direction = resolveSwipe(deltaX, elapsed);
      if (direction === null) return;

      const next = adjacentScreen(screens, screen, direction);
      if (next !== null) onChange(next);
    },
    [enabled, endSession, onChange, screen, screens],
  );

  const bind: SwipeNavBind = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
  };

  if (swiping) bind["data-swiping"] = "true";
  if (offset !== 0 || swiping) {
    bind.style = {
      transform: `translate3d(${offset}px, 0, 0)`,
      // Durante o arraste a transição some: o dedo é a timeline.
      transition: swiping ? "none" : undefined,
    };
  }

  return bind;
}

/** Só para testes: reexporta o tipo de direção. */
export type { SwipeDirection };
