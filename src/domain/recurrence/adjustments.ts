import { compareHlc } from "../clock/hlc";
import { stableEntityIdV1 } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import type { RecurrenceAdjustment } from "../model/recurrence-adjustment";
import { isKnownFrequency, periodOf } from "./schedule";

/**
 * O que `amountFor` lê de um reajuste — permite simular um que ainda não foi gravado.
 *
 * `updatedAt` null é o reajuste simulado (`planAdjustment`): ainda sem versão, ele é a
 * intenção mais nova do usuário e vence qualquer linha gravada da mesma competência.
 */
export type AdjustmentLike = Pick<
  RecurrenceAdjustment,
  "id" | "recurrenceId" | "fromPeriod" | "amountMinor" | "deletedAt"
> & { updatedAt: string | null };

/**
 * Id do reajuste de uma série numa competência, derivado só dos dois.
 *
 * Reajustar de novo o mesmo mês atualiza a mesma linha, e dois aparelhos que
 * reajustam o mesmo mês offline convergem nela pelo LWW. Com ULID aleatório
 * seriam dois reajustes vivos para a mesma competência, sem regra que escolha
 * entre eles.
 */
export function adjustmentId(recurrenceId: Ulid, fromPeriod: string): Ulid {
  return stableEntityIdV1(`${recurrenceId}:adj:${fromPeriod}`);
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
 *
 * Duas linhas vivas na mesma competência (aparelho velho regravando a chave no
 * lugar v1 depois de um novo gravar em v2, ou a corrida entre os dois) desempatam
 * pela regra R, a mesma do `amount_for` do hub: sem ela cada aparelho ficaria com
 * a que a iteração do objeto achasse primeiro, e app e hub mostrariam valores
 * diferentes para o mesmo mês.
 */
export function amountFor(
  series: Pick<Recurrence, "id" | "amountMinor"> &
    Partial<Pick<Recurrence, "startOn" | "frequency" | "firstAmountMinor">>,
  adjustments: readonly AdjustmentLike[],
  period: string,
): number {
  let best: AdjustmentLike | null = null;
  for (const row of adjustments) {
    if (row.deletedAt !== null || row.recurrenceId !== series.id) continue;
    if (row.fromPeriod > period) continue;
    if (best === null || newerAdjustment(row, best)) best = row;
  }
  if (best !== null) return best.amountMinor;
  return isFirstPeriod(series, period)
    ? (validFirst(series) ?? series.amountMinor)
    : series.amountMinor;
}

/**
 * Regra R entre dois reajustes vivos da série: competência maior; na mesma,
 * `updatedAt` maior (a última edição é a intenção do usuário), o não gravado
 * acima de todos; empate → id maior, para o resultado não depender da ordem.
 */
function newerAdjustment(row: AdjustmentLike, best: AdjustmentLike): boolean {
  if (row.fromPeriod !== best.fromPeriod) return row.fromPeriod > best.fromPeriod;
  if (row.updatedAt !== best.updatedAt) {
    if (row.updatedAt === null) return true;
    if (best.updatedAt === null) return false;
    return compareHlc(row.updatedAt, best.updatedAt) > 0;
  }
  return row.id > best.id;
}

/**
 * A 1ª parcela com a sobra de centavos. Reajuste que cubra a competência inicial
 * vence (é uma decisão posterior do usuário). Valor inválido vindo do sync de
 * uma versão futura degrada para o valor-base em vez de gerar centavo quebrado.
 */
function validFirst(series: Partial<Pick<Recurrence, "firstAmountMinor">>): number | null {
  const first = series.firstAmountMinor;
  return typeof first === "number" && Number.isSafeInteger(first) && first > 0 ? first : null;
}

function isFirstPeriod(
  series: Partial<Pick<Recurrence, "startOn" | "frequency">>,
  period: string,
): boolean {
  if (series.startOn == null || series.startOn === "" || series.frequency == null) return false;
  if (!isKnownFrequency(series.frequency)) return false;
  return periodOf(series.frequency, series.startOn) === period;
}
