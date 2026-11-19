import { shiftDay } from "../dates/calendar";
import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { ColorToken, IconKey } from "../model/tokens";
import { recurringMonth } from "../projections/free-money";
import { monthOf } from "../projections/periods";
import { isCompleteCard } from "./card";
import { cardInvoices, type Invoice } from "./invoice";

/** Acima desta parte da renda a porcentagem da fatura vira atenção. */
export const INVOICE_WARNING_PERCENT = 30;

export interface UpcomingInvoice {
  cardId: string;
  /** Nome que a pessoa deu ao cartão: "Fatura Mercado Pago". */
  cardName: string;
  icon: IconKey;
  color: ColorToken;
  /** Mês em que a fatura fecha ('YYYY-MM'). */
  month: string;
  dueOn: string;
  /** Aberta = estimativa (ainda recebe compras); fechada = valor certo. */
  status: Invoice["status"];
  totalMinor: number;
  /** Fatura ÷ renda fixa do mês do vencimento, em %; `null` sem renda fixa. */
  incomePercent: number | null;
}

/**
 * Faturas a vencer em "Próximas saídas" (indicadores §6.5; spec do hub 7.11): de
 * cartões completos e vivos, com vencimento de hoje (inclusive — vence hoje ainda
 * precisa estar na conta) até `today + days`, total positivo, por vencimento.
 *
 * É **saída de caixa**, não despesa nova: cada compra já é despesa no dia em que foi
 * feita. Nada aqui entra em total, previsão ou ritmo; a tela diz isso por extenso.
 */
export function upcomingInvoices(state: AppState, today: string, days: number): UpcomingInvoice[] {
  const limit = shiftDay(today, days);
  const found: UpcomingInvoice[] = [];

  for (const method of Object.values(state.paymentMethods)) {
    if (!isAlive(method) || !isCompleteCard(method)) continue;
    for (const invoice of cardInvoices(state, method, today)) {
      if (invoice.dueOn < today || invoice.dueOn > limit || invoice.totalMinor <= 0) continue;
      const income = recurringMonth(state, monthOf(invoice.dueOn)).incomeMinor;
      found.push({
        cardId: method.id,
        cardName: method.name,
        icon: method.icon,
        color: method.color,
        month: invoice.month,
        dueOn: invoice.dueOn,
        status: invoice.status,
        totalMinor: invoice.totalMinor,
        incomePercent: income > 0 ? Math.round((invoice.totalMinor / income) * 100) : null,
      });
    }
  }

  return found.sort((a, b) =>
    a.dueOn !== b.dueOn ? (a.dueOn < b.dueOn ? -1 : 1) : a.cardId < b.cardId ? -1 : 1,
  );
}
