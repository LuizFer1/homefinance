/**
 * Ilustrações undraw em `public/img/undraw/`.
 *
 * Paths absolutos (Vite copia `public/`). Os nomes `ligth` / `light` seguem os
 * arquivos no disco — não renomear daqui sem renomear o SVG.
 */
export const ILLUSTRATIONS = {
  /** Home (Início): lançamento / pagamento. */
  home: {
    light: "/img/undraw/undraw_enter-payment-info_ligth.svg",
    dark: "/img/undraw/undraw_enter-payment-info_dark.svg",
  },
  /** Dashboard: orçamento / visão de gastos. */
  dashboard: {
    light: "/img/undraw/undraw_budgeting_light.svg",
    dark: "/img/undraw/undraw_budgeting_dark.svg",
  },
} as const;

export type IllustrationKey = keyof typeof ILLUSTRATIONS;
