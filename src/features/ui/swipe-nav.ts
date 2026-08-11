/**
 * Navegação por arraste horizontal entre abas.
 *
 * Dedo para a direita → aba anterior (índice menor); para a esquerda → próxima.
 * Commit por distância **ou** velocidade (flick), no estilo iOS: um puxão curto
 * e rápido também conta. Sem isto o usuário precisa arrastar metade da tela.
 */

/** Distância mínima (px) para trocar de aba sem depender da velocidade. */
export const SWIPE_THRESHOLD_PX = 56;

/**
 * Velocidade mínima (px/ms) para commit por flick.
 * ~0.35 ≈ 350 px/s — um gesto curto e decidido.
 */
export const SWIPE_VELOCITY = 0.35;

/** Quanto o dedo precisa mover antes de travar o eixo (horizontal vs vertical). */
export const SWIPE_AXIS_LOCK_PX = 10;

/** Amortecimento nas bordas (primeira/última aba): arrastar "além" rende menos. */
export const SWIPE_EDGE_DAMPING = 0.28;

export type SwipeDirection = "prev" | "next";

/**
 * Decide se o gesto vira troca de aba.
 *
 * `deltaX` > 0 = dedo moveu para a direita (conteúdo segue o dedo).
 */
export function resolveSwipe(
  deltaX: number,
  elapsedMs: number,
  opts?: { thresholdPx?: number; velocity?: number },
): SwipeDirection | null {
  const threshold = opts?.thresholdPx ?? SWIPE_THRESHOLD_PX;
  const minVelocity = opts?.velocity ?? SWIPE_VELOCITY;
  if (deltaX === 0) return null;

  const direction: SwipeDirection = deltaX > 0 ? "prev" : "next";
  const distance = Math.abs(deltaX);
  const ms = Math.max(elapsedMs, 1);
  const velocity = distance / ms;

  if (distance >= threshold || velocity >= minVelocity) return direction;
  return null;
}

/** Próxima aba no sentido pedido, ou `null` se já está na borda. */
export function adjacentScreen<T extends string>(
  screens: readonly T[],
  current: T,
  direction: SwipeDirection,
): T | null {
  const index = screens.indexOf(current);
  if (index < 0) return null;
  const next = direction === "prev" ? index - 1 : index + 1;
  return screens[next] ?? null;
}

/**
 * Deslocamento visual durante o arraste.
 *
 * Na borda (sem aba no sentido do gesto), aplica amortecimento para o dedo
 * não empurrar a tela como se houvesse página fantasma.
 */
export function dragOffsetPx(
  deltaX: number,
  canPrev: boolean,
  canNext: boolean,
  damping = SWIPE_EDGE_DAMPING,
): number {
  if (deltaX > 0 && !canPrev) return deltaX * damping;
  if (deltaX < 0 && !canNext) return deltaX * damping;
  return deltaX;
}

/** Qual eixo dominou o gesto depois do limiar de lock. */
export function lockAxis(
  deltaX: number,
  deltaY: number,
  lockPx = SWIPE_AXIS_LOCK_PX,
): "horizontal" | "vertical" | null {
  const ax = Math.abs(deltaX);
  const ay = Math.abs(deltaY);
  if (ax < lockPx && ay < lockPx) return null;
  return ax >= ay ? "horizontal" : "vertical";
}
