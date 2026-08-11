/**
 * Ícones de marca.
 *
 * UI (`BrandMark`): maskable 192 claro/escuro via `?url` (arquivo em
 * `dist/assets/`, fora do teto de shell). Paths em `public/img/icons/` ficam
 * para favicon e manifest PWA (`BRAND_PUBLIC_PATHS`).
 *
 * Os nomes com "ligth" são typo histórico no disco.
 */
import darkMaskable192 from "./assets/icon_darkmode_maskable_192.png?url";
import lightMaskable192 from "./assets/icon_ligth_maskable_192.png?url";

/** Par maskable 192 usado na UI (onboarding, Ajustes, shell). */
export const BRAND_ICONS = {
  light: {
    maskable192: lightMaskable192,
  },
  dark: {
    maskable192: darkMaskable192,
  },
} as const;

/** Paths estáticos em `public/` para HTML e manifest (não passar por Vite hash). */
export const BRAND_PUBLIC_PATHS = {
  light: {
    any192: "/img/icons/icon_ligth_not_maskable_192.png",
    any512: "/img/icons/icon_ligth_not_maskable_512.png",
    maskable192: "/img/icons/icon_ligth_maskable_192.png",
    maskable512: "/img/icons/icon_ligth_maskable_512.png",
  },
  dark: {
    any192: "/img/icons/icon_darkmode_maskable_192.png",
    any512: "/img/icons/icon_darkmode_maskable_512.png",
    maskable192: "/img/icons/icon_darkmode_maskable_192.png",
    maskable512: "/img/icons/icon_darkmode_maskable_512.png",
  },
} as const;

/** Dimensões reais do canvas dos ícones de app (não inventar 192x192). */
export const BRAND_ICON_SIZES = {
  sm: "192x204",
  lg: "512x544",
} as const;
