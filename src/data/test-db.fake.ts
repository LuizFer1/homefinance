import "fake-indexeddb/auto";
import type { RandomChunk } from "../domain/ids/ulid";
import { HomeFinanceDb } from "./db";

/**
 * Banco real sobre `fake-indexeddb`, um nome por chamada para as suítes não se
 * enxergarem. O sufixo `.fake` o mantém fora do `include` do Vitest.
 */
let counter = 0;

export function openTestDb(): HomeFinanceDb {
  counter += 1;
  return new HomeFinanceDb(`homefinance-test-${counter}-${Date.now()}`);
}

export const TEST_DEVICE_ID = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";

/** Relógio que anda 1ms por chamada e aleatoriedade fixa: ids e HLCs reprodutíveis. */
export function testSessionDeps(db: HomeFinanceDb): {
  db: HomeFinanceDb;
  now: () => number;
  randomChunk: RandomChunk;
} {
  let millis = 1_754_697_600_000;
  return {
    db,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  };
}
