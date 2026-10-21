import type { AppState } from "../model/app-state";
import { isAlive } from "../model/base";
import type { PaymentMethod } from "../model/payment-method";
import type { Transaction } from "../model/transaction";
import { countsInTotals } from "../transactions/counts-in-totals";
import { isCompleteCard } from "./card";

export interface Invoice {
  cardId: string;
  /** Mês em que a fatura fecha, 'YYYY-MM'. É a identidade dela. */
  month: string;
  /** Data real de fechamento ('YYYY-MM-DD'), já ajustada ao mês curto. */
  closesOn: string;
  /** Data real de vencimento. */
  dueOn: string;
  /** `open`: ainda não fechou em `today`; seu valor é estimativa. */
  status: "open" | "closed";
  totalMinor: number;
  /** Mais recentes primeiro. */
  items: Transaction[];
}

/**
 * Mês como índice absoluto (`ano * 12 + mês`): somar meses no índice resolve a
 * virada de ano, que somar no número do mês (dezembro + 1 = 13) quebraria.
 */
function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1);
}

function monthFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** Último dia do mês, sem `Date` de relógio: 0 do mês seguinte é o último deste. */
function lastDay(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

function dateIn(month: string, day: number): string {
  return `${month}-${String(Math.min(day, lastDay(month))).padStart(2, "0")}`;
}

/**
 * Fatura a que uma compra pertence, pelo mês em que ela fecha.
 *
 * Compra até o dia do fechamento (inclusive) cai na fatura que fecha naquele
 * mês; depois dele, na do mês seguinte. O fechamento é limitado ao último dia
 * do mês: com fechamento no 31, fevereiro fecha no 28 ou 29.
 */
export function invoiceMonthOf(occurredOn: string, closingDay: number): string {
  const month = occurredOn.slice(0, 7);
  const day = Number(occurredOn.slice(8, 10));
  return day <= Math.min(closingDay, lastDay(month))
    ? month
    : monthFromIndex(monthIndex(month) + 1);
}

/**
 * Datas de uma fatura que fecha em `month`. Vencimento no mesmo dia do
 * fechamento ou antes dele só pode ser o do mês seguinte (a fatura fecha e
 * depois vence); o dia também é limitado ao último do mês.
 */
export function invoiceDates(
  month: string,
  closingDay: number,
  dueDay: number,
): { closesOn: string; dueOn: string } {
  const dueMonth = dueDay <= closingDay ? monthFromIndex(monthIndex(month) + 1) : month;
  return { closesOn: dateIn(month, closingDay), dueOn: dateIn(dueMonth, dueDay) };
}

/**
 * Faturas de um cartão calculadas dos lançamentos, mais recentes primeiro. A
 * que contém `today` sempre aparece (mesmo vazia); as fechadas só se tiveram
 * compra. Cartão por completar não tem fatura: devolve vazio.
 *
 * Entra o que `countsInTotals` aceita (transferência e oculto ficam de fora) e
 * a receita no cartão, um estorno, abate a fatura.
 *
 * Nada aqui é a fatura "do banco": é a soma do que foi lançado, e a aberta
 * muda a cada compra. Por isso a tela a rotula como estimativa.
 */
export function cardInvoices(state: AppState, card: PaymentMethod, today: string): Invoice[] {
  if (!isCompleteCard(card)) return [];
  const closingDay = card.closingDay as number;
  const dueDay = card.dueDay as number;

  const byMonth = new Map<string, Transaction[]>();
  const current = invoiceMonthOf(today, closingDay);
  byMonth.set(current, []);

  for (const record of Object.values(state.transactions)) {
    if (!isAlive(record) || record.paymentMethodId !== card.id || !countsInTotals(record)) continue;
    const month = invoiceMonthOf(record.occurredOn, closingDay);
    const list = byMonth.get(month);
    if (list === undefined) byMonth.set(month, [record]);
    else list.push(record);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([month, list]) => {
      const dates = invoiceDates(month, closingDay, dueDay);
      const items = [...list].sort((a, b) =>
        a.occurredOn !== b.occurredOn
          ? a.occurredOn < b.occurredOn
            ? 1
            : -1
          : a.id < b.id
            ? 1
            : -1,
      );
      const totalMinor = items.reduce(
        (sum, item) => sum + (item.kind === "expense" ? item.amountMinor : -item.amountMinor),
        0,
      );
      return {
        cardId: card.id,
        month,
        ...dates,
        status: dates.closesOn >= today ? ("open" as const) : ("closed" as const),
        totalMinor,
        items,
      };
    });
}
