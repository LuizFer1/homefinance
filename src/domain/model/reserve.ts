import type { Ulid } from "../ids/ulid";
import type { BaseRow, Draft } from "./base";
import type { ColorToken, IconKey } from "./tokens";

export const RESERVE_KINDS = ["emergency", "goal"] as const;
export type ReserveKind = (typeof RESERVE_KINDS)[number];

export const EMERGENCY_MULTIPLES = [3, 6, 12] as const;
export type EmergencyMultiple = (typeof EMERGENCY_MULTIPLES)[number];

export const WITHDRAW_REASONS = ["health", "home", "car", "work", "other"] as const;
export type WithdrawReason = (typeof WITHDRAW_REASONS)[number];

export const WITHDRAW_REASON_LABELS: Record<WithdrawReason, string> = {
  health: "Saúde",
  home: "Casa",
  car: "Carro",
  work: "Trabalho",
  other: "Outro",
};

/**
 * O tipo só vale para quem compila contra ele: o log é eterno e um motivo pode
 * chegar de uma versão futura via sync. `Object.hasOwn` e não `in`, para
 * "toString" e companhia não passarem por motivo.
 */
export function isWithdrawReason(value: string | null): value is WithdrawReason {
  return value !== null && Object.hasOwn(WITHDRAW_REASON_LABELS, value);
}

/** Motivo desconhecido (versão futura via sync) aparece como "Outro" em vez de sumir. */
export function reasonLabel(reason: string | null): string {
  return isWithdrawReason(reason) ? WITHDRAW_REASON_LABELS[reason] : WITHDRAW_REASON_LABELS.other;
}

/**
 * As cinco categorias padrão do custo essencial. Só servem para achar os ids
 * **uma vez**, na criação da emergência: depois disso a reserva guarda os ids,
 * e renomear "Moradia" não muda a meta de ninguém.
 */
export const ESSENTIAL_CATEGORY_NAMES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Contas",
  "Saúde",
] as const;

export const EMERGENCY_NAME = "Reserva de emergência";
export const EMERGENCY_ICON = "lifebuoy";
/** A UI desenha a identidade accent; o token só existe porque a coluna é da paleta fechada. */
export const EMERGENCY_COLOR: ColorToken = "violet";

export interface RecurringDeposit {
  amountMinor: number;
  /** Dia do mês, 1–31; mês curto usa o último dia. */
  day: number;
  /** 'YYYY-MM': primeiro mês em que o depósito vale. */
  since: string;
}

export interface Reserve extends BaseRow {
  kind: ReserveKind;
  name: string;
  icon: IconKey;
  color: ColorToken;
  /** Caixinha: meta em centavos, ou null. Emergência: sempre null (meta derivada). */
  targetMinor: number | null;
  /** Só emergência. */
  multiple: EmergencyMultiple | null;
  /** Só emergência: categorias do custo essencial, gravadas na criação. */
  essentialCategoryIds: Ulid[] | null;
  /** Só emergência: custo essencial digitado quando não há histórico. */
  essentialOverrideMinor: number | null;
  /** Caixinha: 'YYYY-MM', ou null. */
  deadline: string | null;
  recurring: RecurringDeposit | null;
}

export type ReserveDraft = Draft<Reserve>;

export interface ReserveMovement extends BaseRow {
  reserveId: Ulid;
  /** + guardar, − retirar. Nunca 0. */
  amountMinor: number;
  /** 'YYYY-MM-DD': decide de que mês o dinheiro sai ou para que mês volta. */
  occurredOn: string;
  /** Autor; decidido pela store, nenhum update o reescreve. */
  userId: Ulid | null;
  description: string | null;
  /** Obrigatório quando `amountMinor < 0`. */
  reason: WithdrawReason | null;
  /** Nasceu do depósito mensal. */
  recurring: boolean;
}

export type ReserveMovementDraft = Draft<ReserveMovement>;
