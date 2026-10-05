import { compareHlc } from "../clock/hlc";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { Category } from "../model/category";
import type { PaymentMethod } from "../model/payment-method";
import { DEFAULT_CATEGORIES, DEFAULT_METHODS, type DefaultEntry, GENESIS_HLC } from "./defaults";

type Row = Category | PaymentMethod;

/** Mesmo formato de `ExpectedVersions` da sessão, restrito às duas tabelas. */
export interface DefaultsMerge {
  rows: { categories?: Category[]; paymentMethods?: PaymentMethod[] };
  expected: {
    categories?: Record<Ulid, string | null>;
    paymentMethods?: Record<Ulid, string | null>;
  };
}

interface Draftish {
  name: string;
  kind: string;
}

function sameAsDefault(row: Draftish, draft: Draftish): boolean {
  return row.name === draft.name && row.kind === draft.kind;
}

function planTable<T extends Row>(
  rows: Record<Ulid, T>,
  defaults: readonly DefaultEntry<Draftish>[],
  stamp: () => string,
): { rows: T[]; expected: Record<Ulid, string | null> } {
  const out: T[] = [];
  const expected: Record<Ulid, string | null> = {};
  const alive = Object.values(rows).filter((row) => isAlive(row));

  for (const item of defaults) {
    const copies = alive.filter((row) => row.id !== item.id && sameAsDefault(row, item.draft));
    if (copies.length === 0) continue;

    const stable = rows[item.id];
    // Estável apagada ou renomeada é decisão de alguém. Uma "Alimentação" viva
    // ao lado dela pode ter sido criada à mão depois — fundir a sumiria.
    if (stable !== undefined && !(isAlive(stable) && sameAsDefault(stable, item.draft))) continue;

    expected[item.id] = stable?.updatedAt ?? null;
    // Na gênese a estável é a semente intocada; a cópia pode ter a cor que a
    // pessoa escolheu. Com HLC real, outro aparelho já migrou e o LWW decide.
    if (stable === undefined || stable.updatedAt === GENESIS_HLC) {
      const freshest = copies.reduce((a, b) => (compareHlc(b.updatedAt, a.updatedAt) > 0 ? b : a));
      out.push({
        ...freshest,
        id: item.id,
        mergedInto: null,
        updatedAt: stamp(),
        deletedAt: null,
        dirty: 1,
      });
    }
    for (const copy of copies) {
      expected[copy.id] = copy.updatedAt;
      const hlc = stamp();
      out.push({ ...copy, mergedInto: item.id, deletedAt: hlc, updatedAt: hlc, dirty: 1 });
    }
  }
  return { rows: out, expected };
}

/**
 * Funde as cópias de um padrão — semeadas com id aleatório, uma por aparelho,
 * antes de o padrão ter id fixo — na linha de id estável. Cada cópia vira
 * lápide com `mergedInto`, e `resolveMerged` leva para a estável o que ainda
 * aponta para ela.
 *
 * Cópia é linha viva com nome e tipo exatos de um padrão: um padrão renomeado
 * antes da correção já é cadastro da pessoa e fica como está.
 *
 * Pura e idempotente: o estado depois do plano não gera outro plano. Roda no
 * boot e depois de cada pull, porque um aparelho ainda na versão velha pode
 * mandar cópia nova a qualquer momento.
 */
export function planDefaultsMerge(state: AppState, stamp: () => string): DefaultsMerge | null {
  const categories = planTable(state.categories, DEFAULT_CATEGORIES, stamp);
  const methods = planTable(state.paymentMethods, DEFAULT_METHODS, stamp);
  if (categories.rows.length === 0 && methods.rows.length === 0) return null;

  const plan: DefaultsMerge = { rows: {}, expected: {} };
  if (categories.rows.length > 0) {
    plan.rows.categories = categories.rows;
    plan.expected.categories = categories.expected;
  }
  if (methods.rows.length > 0) {
    plan.rows.paymentMethods = methods.rows;
    plan.expected.paymentMethods = methods.expected;
  }
  return plan;
}
