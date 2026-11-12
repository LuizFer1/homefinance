import type { Ulid } from "../ids/ulid";
import type { BaseRow, Draft } from "./base";
import type { BookScoped } from "./book";
import type { TransactionKind } from "./transaction";

/**
 * Tudo que uma série pode ter gravado. `bimonthly`, `quarterly` e `semiannual`
 * saíram do formulário mas seguem aqui: há séries delas em aparelhos e no hub, e
 * apagar o valor da união faria a série antiga parar de gerar.
 */
export const RECURRENCE_FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/** O que o formulário oferece, na ordem da tela. */
export const OFFERED_FREQUENCIES = ["weekly", "biweekly", "monthly", "annual"] as const;

/** Passo em dias: a competência da ocorrência é a própria data, não o mês. */
export type DayStepFrequency = "weekly" | "biweekly";
/** Passo em meses: a competência é `YYYY-MM`. */
export type MonthStepFrequency = Exclude<RecurrenceFrequency, DayStepFrequency>;

export const SCHEDULE_TYPES = ["dayOfMonth", "nthBusinessDay"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

/** A regra. As ocorrências são `Transaction` com `recurrenceId` e `occurrenceKey`. */
export interface Recurrence extends BaseRow, BookScoped {
  kind: TransactionKind;
  description: string;
  amountMinor: number;
  currency: "BRL";
  categoryId: Ulid | null;
  paymentMethodId: Ulid | null;
  cashbackMinor: number | null;
  frequency: RecurrenceFrequency;
  scheduleType: ScheduleType;
  /** Dia do mês (1–31) ou N-ésimo dia útil (1–23). */
  scheduleN: number;
  startOn: string;
  endOn: string | null;
  /** `false` pausa a geração sem apagar o que já foi materializado. */
  active: boolean;
  /**
   * `true`: o valor muda todo mês (luz, água). Cada ocorrência nasce estimada
   * pela média das confirmadas, e `amountMinor` é só o palpite até haver
   * histórico. Ausente vale `null` (série fixa).
   */
  variable?: boolean | null;
  /**
   * Valor da 1ª ocorrência quando difere de `amountMinor`: a sobra de centavos
   * de um parcelamento (R$ 100 em 3x = 33,34 + 33,33 + 33,33). Fica na série, e
   * não só na ocorrência, porque qualquer aparelho pode materializar a 1ª
   * parcela (compra com data futura) e todos têm de gerar o mesmo valor.
   * Ausente vale `null`: todas as ocorrências seguem `amountMinor`.
   */
  firstAmountMinor?: number | null;
  /**
   * Autor da série. As ocorrências herdam este autor, não o do aparelho que as
   * materializou: sem isto, o mês gerado no telefone de outra pessoa aparecia
   * como lançado por ela. Decidido pela store no create; nenhum update o
   * reescreve. Ausente nas séries anteriores à coluna (ver `planAuthorRepair`).
   */
  userId?: Ulid | null;
}

/**
 * `userId` fica fora do draft pelo mesmo motivo de `TransactionDraft`: autoria
 * não é campo de formulário, e `editSeries` recebe um draft.
 */
export type RecurrenceDraft = Omit<Draft<Recurrence>, "userId">;

/** O que o formulário de lançamento acrescenta para virar série. */
export type RecurrenceRule = Pick<
  Recurrence,
  "frequency" | "scheduleType" | "scheduleN" | "endOn"
> & {
  variable: boolean;
  /**
   * Parcelado em N vezes: o valor do lançamento é o total, e a série grava a
   * parcela (ver `splitInstallments`). Só o formulário usa; não é coluna.
   */
  installments?: number;
};

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  dayOfMonth: "Dia fixo do mês",
  nthBusinessDay: "Dia útil do mês",
};

/** Textos do toggle de valor variável, que acompanham o ritmo da série. */
export interface VariableCopy {
  label: string;
  /** Com o toggle ligado. */
  hintOn: string;
  /** Com o toggle desligado. */
  hintOff: string;
}

const VARIABLE_ESTIMATE = "a média dos últimos 6 confirmados. Este valor é o palpite até lá.";

/**
 * Séries antigas (bimestral etc.) usam o texto mensal: o formulário nem as
 * oferece mais, mas o mapa é total para não haver `undefined` com valor de
 * versão futura ou legado.
 */
export const VARIABLE_COPY: Record<RecurrenceFrequency, VariableCopy> = {
  weekly: {
    label: "Valor varia toda semana",
    hintOn: `Cada semana nasce com ${VARIABLE_ESTIMATE}`,
    hintOff: "Feira, combustível: o valor só existe quando a conta chega.",
  },
  biweekly: {
    label: "Valor varia a cada quinzena",
    hintOn: `Cada quinzena nasce com ${VARIABLE_ESTIMATE}`,
    hintOff: "O valor só existe quando a conta chega.",
  },
  monthly: {
    label: "Valor varia todo mês",
    hintOn: `Cada mês nasce com ${VARIABLE_ESTIMATE}`,
    hintOff: "Luz, água: o valor só existe quando a conta chega.",
  },
  bimonthly: {
    label: "Valor varia todo mês",
    hintOn: `Cada mês nasce com ${VARIABLE_ESTIMATE}`,
    hintOff: "Luz, água: o valor só existe quando a conta chega.",
  },
  quarterly: {
    label: "Valor varia todo mês",
    hintOn: `Cada mês nasce com ${VARIABLE_ESTIMATE}`,
    hintOff: "Luz, água: o valor só existe quando a conta chega.",
  },
  semiannual: {
    label: "Valor varia todo mês",
    hintOn: `Cada mês nasce com ${VARIABLE_ESTIMATE}`,
    hintOff: "Luz, água: o valor só existe quando a conta chega.",
  },
  annual: {
    label: "Valor varia todo ano",
    hintOn: `Cada ano nasce com ${VARIABLE_ESTIMATE}`,
    hintOff: "O valor só existe quando a conta chega.",
  },
};
