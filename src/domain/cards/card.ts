import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { PaymentMethod } from "../model/payment-method";

/** Dia de mês aceito no fechamento e no vencimento. */
export const MIN_CARD_DAY = 1;
export const MAX_CARD_DAY = 31;

/**
 * Inteiro de 1 a 31. Valor de outra versão (texto, 0, 45, decimal) não passa:
 * vira "cartão por completar" em vez de gerar uma fatura com data inventada.
 */
export function isValidCardDay(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_CARD_DAY &&
    value <= MAX_CARD_DAY
  );
}

export function isCreditCard(method: Pick<PaymentMethod, "kind">): boolean {
  return method.kind === "credit";
}

function hasBank(method: Pick<PaymentMethod, "bank">): boolean {
  return typeof method.bank === "string" && method.bank.trim() !== "";
}

/** Crédito com banco, fechamento e vencimento válidos: dá para calcular fatura. */
export function isCompleteCard(method: PaymentMethod): boolean {
  return (
    isCreditCard(method) &&
    hasBank(method) &&
    isValidCardDay(method.closingDay) &&
    isValidCardDay(method.dueDay)
  );
}

/**
 * Crédito sem os dados do cartão: o "Cartão de crédito" genérico, ou qualquer
 * cadastro `credit` anterior a esta versão. É a definição que dispara a
 * migração, derivada da linha e nunca de um flag de versão.
 */
export function isIncompleteCard(method: PaymentMethod): boolean {
  return isCreditCard(method) && !isCompleteCard(method);
}

/** Cartões de crédito visíveis, completos primeiro e depois por nome. */
export function listCreditCards(state: AppState): PaymentMethod[] {
  return Object.values(state.paymentMethods)
    .filter((method) => isAlive(method) && isCreditCard(method))
    .sort((a, b) => {
      const byComplete = Number(isIncompleteCard(a)) - Number(isIncompleteCard(b));
      if (byComplete !== 0) return byComplete;
      const byName = a.name.localeCompare(b.name, "pt-BR");
      if (byName !== 0) return byName;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * Linha de apoio do cartão nos seletores: banco (quando o nome é outro) e ciclo
 * da fatura. Cartão por completar avisa em vez de calar, e as outras formas de
 * pagamento não têm linha.
 */
export function cardDetail(method: PaymentMethod): string | null {
  if (!isCreditCard(method)) return null;
  const cycle = cardCycleText(method);
  if (cycle === null) return "Sem dados do cartão";
  const bank = (method.bank ?? "").trim();
  return bank !== "" && bank !== method.name ? `${bank} · ${cycle}` : cycle;
}

/** "Fecha dia 5 · vence dia 12", ou nulo se o cartão não tem os dados. */
export function cardCycleText(method: PaymentMethod): string | null {
  if (!isCompleteCard(method)) return null;
  return `Fecha dia ${method.closingDay} · vence dia ${method.dueDay}`;
}
