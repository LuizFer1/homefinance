import type { HomeFinanceDb } from "./db";

/**
 * Chave de `meta` do adiamento da migração de cartões. Local, nunca sincroniza:
 * "Depois" é uma decisão sobre este aparelho, e o outro pode querer resolver
 * agora. O valor é o ISO do momento em que a pessoa adiou.
 */
export const CARD_MIGRATION_DEFERRED_KEY = "cardMigrationDeferredAt";

export async function deferCardMigration(db: HomeFinanceDb, iso: string): Promise<void> {
  await db.meta.put({ key: CARD_MIGRATION_DEFERRED_KEY, value: iso });
}

export async function readCardMigrationDeferral(db: HomeFinanceDb): Promise<string | null> {
  return (await db.meta.get(CARD_MIGRATION_DEFERRED_KEY))?.value ?? null;
}

/** O adiamento vale até o próximo boot: o app o limpa ao abrir. */
export async function clearCardMigrationDeferral(db: HomeFinanceDb): Promise<void> {
  await db.meta.delete(CARD_MIGRATION_DEFERRED_KEY);
}
