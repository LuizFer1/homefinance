import { stableEntityIdV1 } from "../ids/stable-id";
import { newerByRuleR, pickStableId, rowForKey } from "../ids/stable-slot";
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

/** Semente do id do reajuste: a chave `(série, competência)`. */
export function adjustmentSeed(recurrenceId: Ulid, fromPeriod: string): string {
  return `${recurrenceId}:adj:${fromPeriod}`;
}

/**
 * O lugar v1 do reajuste de uma série numa competência, derivado só dos dois.
 *
 * Reajustar de novo o mesmo mês atualiza a mesma linha, e dois aparelhos que
 * reajustam o mesmo mês offline convergem nela pelo LWW. Com ULID aleatório
 * seriam dois reajustes vivos para a mesma competência.
 *
 * É o lugar, não a identidade: a v1 colide (spec do id estável, §1), e a linha
 * do lugar pode ser o reajuste de outra série. Quem procura o reajuste usa
 * `adjustmentForKey`; quem grava, `adjustmentTargetId`.
 */
export function adjustmentId(recurrenceId: Ulid, fromPeriod: string): Ulid {
  return stableEntityIdV1(adjustmentSeed(recurrenceId, fromPeriod));
}

/**
 * A linha do reajuste da série na competência, procurada pelos campos — viva ou
 * apagada, em qualquer id (ver `rowForKey`). Pelo id derivado acharia, depois de
 * uma colisão, o reajuste de outra série, e o escritor reescreveria o valor dela.
 */
export function adjustmentForKey(
  state: AppState,
  recurrenceId: Ulid,
  fromPeriod: string,
): RecurrenceAdjustment | null {
  return rowForKey(
    Object.values(state.recurrenceAdjustments).filter(
      (row) => row.recurrenceId === recurrenceId && row.fromPeriod === fromPeriod,
    ),
  );
}

/**
 * Id onde gravar o reajuste: o da linha que a chave já tem, ou, sem nenhuma, v1
 * se o lugar está livre e v2 se é de outro reajuste (`pickStableId`).
 *
 * Quem grava passa a tabela inteira (`fullState`), não a visão de uma conta: o
 * lugar v1 pode ser de um reajuste da outra conta, que a visão esconde.
 */
export function adjustmentTargetId(state: AppState, recurrenceId: Ulid, fromPeriod: string): Ulid {
  return (
    adjustmentForKey(state, recurrenceId, fromPeriod)?.id ??
    pickStableId(state.recurrenceAdjustments, adjustmentSeed(recurrenceId, fromPeriod))
  );
}

/**
 * Reajustes vivos da série, do mais antigo para o mais novo, **um por
 * competência**: com duas linhas vivas na mesma (aparelho velho e novo), só a
 * vencedora da regra R, a que `amountFor` usa. O histórico da tela não mostra o
 * mês duas vezes, e o valor listado é o que vale.
 */
export function adjustmentsOf(state: AppState, recurrenceId: Ulid): RecurrenceAdjustment[] {
  const byPeriod = new Map<string, RecurrenceAdjustment>();
  for (const row of Object.values(state.recurrenceAdjustments)) {
    if (row.deletedAt !== null || row.recurrenceId !== recurrenceId) continue;
    const current = byPeriod.get(row.fromPeriod);
    if (current === undefined || newerByRuleR(row, current)) byPeriod.set(row.fromPeriod, row);
  }
  return [...byPeriod.values()].sort((a, b) =>
    a.fromPeriod < b.fromPeriod ? -1 : a.fromPeriod > b.fromPeriod ? 1 : 0,
  );
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
  if (row.updatedAt === null || best.updatedAt === null) {
    if (row.updatedAt === best.updatedAt) return row.id > best.id;
    return row.updatedAt === null;
  }
  return newerByRuleR(
    { id: row.id, updatedAt: row.updatedAt },
    {
      id: best.id,
      updatedAt: best.updatedAt,
    },
  );
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
