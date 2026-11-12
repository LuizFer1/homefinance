import type { AppState } from "../model/app-state";
import type { Asset, AssetKind } from "../model/asset";
import { isAlive } from "../model/base";
import { bookOf } from "../model/book";
import type { Debt } from "../model/debt";

/**
 * Capital aplicado do negócio, por tipo de bem. Bens e dívidas são patrimônio:
 * nenhuma destas somas alimenta `totals`, `breakdown` nem `insights`, que leem só
 * `transactions`. O hub (`dashboard/business.rs`) faz as mesmas contas — mudar a
 * regra aqui sem mudar lá faz os dois painéis discordarem.
 */
export interface CapitalByKind {
  investmentMinor: number;
  inventoryMinor: number;
  equipmentMinor: number;
  /** Investimento + estoque + equipamento. */
  totalMinor: number;
}

/**
 * Soma os bens vivos da conta comercial por tipo.
 *
 * O total é a soma dos **três tipos conhecidos**, e não "todos os bens vivos": um
 * tipo que só uma versão futura conhece (chegando por sync) fica fora, como no
 * hub. O filtro por conta é redundante com a visão de propósito: uma visão errada
 * (a pessoal) dá zero em vez de somar bem pessoal como capital.
 */
export function capitalByKind(assets: Iterable<Asset>): CapitalByKind {
  const sums: Record<AssetKind, number> = { investment: 0, inventory: 0, equipment: 0 };
  for (const asset of assets) {
    if (!isAlive(asset) || bookOf(asset) !== "business") continue;
    if (Object.hasOwn(sums, asset.kind)) sums[asset.kind] += asset.valueMinor;
  }
  return {
    investmentMinor: sums.investment,
    inventoryMinor: sums.inventory,
    equipmentMinor: sums.equipment,
    totalMinor: sums.investment + sums.inventory + sums.equipment,
  };
}

/**
 * Saldo devedor total das dívidas vivas: soma de `balanceMinor` (o que ainda se
 * deve), nunca de `principalMinor`.
 */
export function debtTotal(debts: Iterable<Debt>): number {
  let total = 0;
  for (const debt of debts) {
    if (isAlive(debt) && bookOf(debt) === "business") total += debt.balanceMinor;
  }
  return total;
}

/** Bens vivos: mais recentes primeiro; empate por id, para a ordem não depender da inserção. */
export function listAssets(state: AppState): Asset[] {
  return Object.values(state.assets)
    .filter((asset) => isAlive(asset))
    .sort((a, b) => {
      if (a.acquiredOn !== b.acquiredOn) return a.acquiredOn < b.acquiredOn ? 1 : -1;
      return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
    });
}

/** Dívidas vivas: a que vence primeiro vem na frente; sem vencimento, no fim, por nome. */
export function listDebts(state: AppState): Debt[] {
  return Object.values(state.debts)
    .filter((debt) => isAlive(debt))
    .sort((a, b) => {
      const dueA = a.dueOn ?? null;
      const dueB = b.dueOn ?? null;
      if (dueA !== dueB) {
        if (dueA === null) return 1;
        if (dueB === null) return -1;
        return dueA < dueB ? -1 : 1;
      }
      const byName = a.name.localeCompare(b.name, "pt-BR");
      if (byName !== 0) return byName;
      return a.id < b.id ? -1 : 1;
    });
}
