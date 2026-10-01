import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import type { RecurrenceAdjustment } from "../model/recurrence-adjustment";

/** O que `amountFor` lê de um reajuste — permite simular um que ainda não foi gravado. */
export type AdjustmentLike = Pick<
  RecurrenceAdjustment,
  "recurrenceId" | "fromPeriod" | "amountMinor" | "deletedAt"
>;

/**
 * Id do reajuste de uma série numa competência, derivado só dos dois.
 *
 * Reajustar de novo o mesmo mês atualiza a mesma linha, e dois aparelhos que
 * reajustam o mesmo mês offline convergem nela pelo LWW. Com ULID aleatório
 * seriam dois reajustes vivos para a mesma competência, sem regra que escolha
 * entre eles.
 */
export function adjustmentId(recurrenceId: Ulid, fromPeriod: string): Ulid {
  return stableEntityId(`${recurrenceId}:adj:${fromPeriod}`);
}

/** Reajustes vivos da série, do mais antigo para o mais novo. */
export function adjustmentsOf(state: AppState, recurrenceId: Ulid): RecurrenceAdjustment[] {
  return Object.values(state.recurrenceAdjustments)
    .filter((row) => row.deletedAt === null && row.recurrenceId === recurrenceId)
    .sort((a, b) => (a.fromPeriod < b.fromPeriod ? -1 : a.fromPeriod > b.fromPeriod ? 1 : 0));
}

/**
 * Valor vigente da série na competência `period`: o do reajuste vivo de maior
 * `fromPeriod` até ela, ou o valor-base da série se não houver nenhum.
 *
 * Filtra série e `deletedAt` aqui dentro, e não só em quem chama: a
 * materialização passa a tabela inteira, e um reajuste apagado que ainda
 * valesse faria a ocorrência nascer com um valor que o usuário desfez.
 */
export function amountFor(
  series: Pick<Recurrence, "id" | "amountMinor">,
  adjustments: readonly AdjustmentLike[],
  period: string,
): number {
  let best: AdjustmentLike | null = null;
  for (const row of adjustments) {
    if (row.deletedAt !== null || row.recurrenceId !== series.id) continue;
    if (row.fromPeriod > period) continue;
    if (best === null || row.fromPeriod > best.fromPeriod) best = row;
  }
  return best?.amountMinor ?? series.amountMinor;
}
