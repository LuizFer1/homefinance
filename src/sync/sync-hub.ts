/**
 * Entrada do `import()` dinâmico. É o único módulo de `src/sync/` que o shell
 * referencia — e só por `typeof import(...)`, que o TypeScript apaga. O nome
 * do arquivo vira o nome do chunk (`sync-hub-<hash>.js`), e é por ele que
 * `scripts/check-size.mjs` e o Workbox o reconhecem: renomear aqui exige
 * renomear lá.
 */

export type { RejectedRow, SyncSummary } from "./engine";
export { runSync } from "./engine";
export type { PairInput } from "./pairing";
export { pairWithHub } from "./pairing";
export type { HubTransport, SyncErrorKind } from "./transport";
export { createHubTransport, SyncError } from "./transport";
