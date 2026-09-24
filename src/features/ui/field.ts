/**
 * As classes que definem "campo de formulário" neste app.
 *
 * Moram fora dos componentes porque o gatilho de data, o stepper e os inputs
 * precisam ser indistinguíveis lado a lado, e duas cópias da mesma string
 * divergem no primeiro ajuste de altura.
 */

/** Rótulo em caixa alta do handoff (11px/500, 0.08em, 60%). */
export const LABEL = "hf-label block";

/**
 * Input de 48px com borda `divider`; focado, a borda vira acento. Sem anel: o
 * foco do Nocturne é a própria borda.
 *
 * O fundo depende de onde o campo mora — `surface` na página, `bg` dentro do
 * sheet (que já é `surface`). Por isso dois sabores, e não um fundo fixo.
 */
const BASE =
  "h-12 w-full rounded-lg border border-divider px-3.5 text-base text-fg outline-none " +
  "placeholder:text-fg/40 transition-[border-color] duration-150 focus:border-accent " +
  "focus-visible:outline-none";

export const FIELD_PAGE = `${BASE} bg-surface`;
export const FIELD_SHEET = `${BASE} bg-bg`;

/** Texto de ajuda sob um campo (13px, 55%). */
export const HINT = "mt-2 text-[13px] leading-[1.45] text-fg/55 text-pretty";
