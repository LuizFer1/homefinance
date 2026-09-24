/// <reference types="vitest/config" />

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    // Instalabilidade e offline sem UI propria: o browser oferece "Instalar"
    // quando ha manifest + service worker. injectRegister registra o SW no
    // entry; autoUpdate aplica cache novo na proxima visita sem prompt.
    VitePWA({
      registerType: "autoUpdate",
      // Script externo em dist/registerSW.js — evita puxar workbox-window
      // para o chunk da SPA e estourar o teto de first paint.
      injectRegister: "script",
      includeAssets: ["img/icons/*.png"],
      manifest: {
        name: "HomeFinance",
        short_name: "HomeFinance",
        description: "Financas pessoais offline-first. Dados so neste aparelho.",
        lang: "pt-BR",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#161826",
        theme_color: "#161826",
        // Canvas real: 192x204 / 512x544 (nao quadrado). purpose any = fundo
        // opaco claro; maskable = glifo transparente (claro e escuro).
        icons: [
          {
            src: "/img/icons/icon_light_not_maskable_192.png",
            sizes: "192x204",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/img/icons/icon_light_not_maskable_512.png",
            sizes: "512x544",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/img/icons/icon_light_maskable_192.png",
            sizes: "192x204",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/img/icons/icon_light_maskable_512.png",
            sizes: "512x544",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/img/icons/icon_dark_maskable_192.png",
            sizes: "192x204",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/img/icons/icon_dark_maskable_512.png",
            sizes: "512x544",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // SPA: navegacao desconhecida cai no shell cacheado.
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webp,woff2}"],
      },
      // Em dev o SW atrapalha HMR; so entra no build de producao.
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: "es2022",
    // PNGs de marca e SVGs pequenos nao podem virar data-URL no JS: ~8kb gzip
    // no shell so para o BrandMark. Arquivo separado em dist/assets/.
    assetsInlineLimit: 0,
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
  },
});
