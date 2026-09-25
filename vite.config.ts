/// <reference types="vitest/config" />

import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages de projeto serve o site em /<repo>/ — aqui o repositorio
// `homefinance`, em https://luizfer1.github.io/homefinance/. Tudo que e caminho
// absoluto (manifest, SW, icones) sai daqui; um "/" solto apontaria para a raiz
// de luizfer1.github.io, que e outro site. Renomear o repositorio muda o
// caminho: esta constante tem que acompanhar.
const BASE = "/homefinance/";

export default defineConfig({
  base: BASE,
  // Quick tunnel (`cloudflared`): Host = *.trycloudflare.com. O Vite bloqueia
  // por padrao. Prefixo `.` cobre qualquer subdominio do trycloudflare.
  // Config so aplica no boot — reinicie o `npm run dev` apos mudar.
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
  plugins: [
    preact(),
    tailwindcss(),
    // Instalabilidade e offline: o browser oferece "Instalar" quando ha
    // manifest + service worker. `prompt` faz a versao nova instalar e esperar;
    // o app avisa e so troca quando a pessoa aceita (features/update/store.ts
    // manda o SKIP_WAITING). Com autoUpdate a troca era muda e a aba aberta
    // seguia na versao velha, pedindo chunks que o deploy ja tinha apagado.
    VitePWA({
      registerType: "prompt",
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
        // scope cobre a landing (raiz) e o app (/app/): o botao "Instalar" da
        // landing so funciona numa pagina dentro do escopo do manifest. Ja
        // start_url e id apontam para o app — o icone instalado nunca abre a
        // landing, e mudar o id depois faria o navegador ver outro app.
        id: `${BASE}app/`,
        start_url: `${BASE}app/`,
        scope: BASE,
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#161826",
        theme_color: "#161826",
        // Quadrados de proposito: o Chrome so aceita icone principal quadrado, e
        // com o canvas antigo (192x204 / 512x544) recusava instalar com
        // `no-acceptable-icon`. pwa-icons.test.ts confere declarado vs arquivo.
        // purpose any = fundo opaco claro; maskable = glifo transparente.
        // Caminho relativo: resolve contra a URL do manifest, que ja mora no BASE.
        icons: [
          {
            src: "img/icons/icon_light_not_maskable_192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "img/icons/icon_light_not_maskable_512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "img/icons/icon_light_maskable_192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "img/icons/icon_light_maskable_512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "img/icons/icon_dark_maskable_192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "img/icons/icon_dark_maskable_512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // SPA: navegacao desconhecida dentro de /app/ cai no shell cacheado. A
        // allowlist impede que uma URL perdida fora do app (um link velho, um
        // typo na landing) abra o app no lugar da pagina que a pessoa pediu.
        // So vale na primeira instalacao (as seguintes esperam o SKIP_WAITING):
        // a pagina ja nasce controlada e o leitor de PDF entra no cache na
        // primeira importacao, e nao so a partir da segunda visita.
        clientsClaim: true,
        navigateFallback: `${BASE}app/index.html`,
        navigateFallbackAllowlist: [/\/app\//],
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webp,woff2}"],
        // O leitor de PDF (~490kb gzip) fica fora do precache: todo mundo que
        // instala o app baixaria o pdf.js para um recurso mensal. Entra no
        // cache na primeira importação e daí em diante funciona offline.
        globIgnores: ["**/pdf-text-*.js", "**/pdf.worker*.mjs"],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/pdf(-text-|\.worker)[^/]*\.m?js$/,
            // Nome com hash: o arquivo nunca muda, então rede de novo é desperdício.
            handler: "CacheFirst",
            options: { cacheName: "pdf-reader", expiration: { maxEntries: 4 } },
          },
        ],
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
    // Duas paginas, um build: a landing na raiz e o app em /app/. A chave de
    // cada entrada vira o prefixo dos arquivos (landing-*.js, app-*.js), e e por
    // ele que o check-size separa os dois orcamentos.
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, "index.html"),
        app: resolve(import.meta.dirname, "app/index.html"),
      },
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
  },
});
