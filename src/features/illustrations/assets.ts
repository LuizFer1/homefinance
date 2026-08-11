/**
 * Ilustrações undraw em `public/img/undraw/`.
 *
 * Paths absolutos (Vite copia `public/`). Nome do arquivo = tema da app
 * (`_light` / `_dark`) em que a variante deve aparecer.
 */
export const ILLUSTRATIONS = {
  /** Home (Início): lançamento / pagamento. */
  home: {
    light: "/img/undraw/undraw_enter-payment-info_light.svg",
    dark: "/img/undraw/undraw_enter-payment-info_dark.svg",
  },
  /** Dashboard: orçamento / visão de gastos. */
  dashboard: {
    light: "/img/undraw/undraw_budgeting_light.svg",
    dark: "/img/undraw/undraw_budgeting_dark.svg",
  },
} as const;

export type IllustrationKey = keyof typeof ILLUSTRATIONS;
