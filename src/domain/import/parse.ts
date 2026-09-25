import { lastDayOfMonth } from "../dates/business-day";
import type { TransactionKind } from "../model/transaction";

/** `card`: fatura de cartão. `account`: extrato de conta. Escolhido pelo usuário. */
export type DocumentKind = "card" | "account";

export interface Installment {
  k: number;
  n: number;
}

/** Uma linha reconhecida, antes da revisão. */
export interface ParsedEntry {
  /** 'YYYY-MM-DD'. */
  date: string;
  /** Sem a parcela e com espaços colapsados — o que a revisão mostra e edita. */
  description: string;
  /**
   * A descrição como veio do PDF, sem a marca de parcela e nunca editada. É
   * dela que sai o id determinístico: se a edição na revisão entrasse no id,
   * reimportar o mesmo PDF geraria linhas novas; se o "03/10" entrasse, cada
   * fatura abriria uma série nova para a mesma compra.
   */
  rawDescription: string;
  /** Sempre positivo; o sentido está em `kind`. */
  amountMinor: number;
  kind: TransactionKind;
  installment: Installment | null;
  /** Vem marcada na revisão? */
  selected: boolean;
  /** Por que está desmarcada ou merece atenção. */
  note: string | null;
}

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const NUMERIC_DATE = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{4}|\d{2}))?(?!\d)/;
const NAMED_DATE = new RegExp(`^(\\d{1,2})\\s*(?:de\\s+)?(${MONTHS.join("|")})[a-zç]*\\.?`, "i");

/**
 * Valor em reais: `1.234,56`, com `R$`, sinal antes (`-`, `+`, `−`) ou marca
 * depois (`-`, `D`, `C`). O lookbehind impede casar dentro de outra palavra ou
 * número ("ABC1,00", "1.234.567").
 */
const MONEY =
  /(?<![\p{L}\d.,])([-+−]\s?)?(?:R\$\s?)?([-+−]\s?)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)(\s?-(?!\d)|\s[DC](?![\p{L}\d]))?/gu;

const INSTALLMENT = [
  /\bPARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/i,
  /(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/,
];

const CARD_PAYMENT = /\b(PAGAMENTO|PAGTO|PGTO)\b/i;
const ACCOUNT_CARD_BILL = /\bFATURA\b|\bCART(?:AO|ÃO)\b/i;
const BALANCE = /\bSALDO\b/i;

/** Maior parcelamento aceito. Acima disso, `k/n` é mais provável ser outra coisa. */
const MAX_INSTALLMENTS = 48;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Ano de uma data impressa sem ano: o mais recente em que o mês não passa do
 * mês de referência. Nenhuma linha de fatura ou extrato é posterior ao próprio
 * documento, e a compra de dezembro na fatura de janeiro cai no ano anterior.
 */
export function inferYear(month: number, referenceMonth: string): number {
  const refYear = Number(referenceMonth.slice(0, 4));
  const refMonth = Number(referenceMonth.slice(5, 7));
  return month <= refMonth ? refYear : refYear - 1;
}

/**
 * Mês de referência pelo vencimento. O rótulo e a data às vezes caem em linhas
 * visuais diferentes (caixa lateral), por isso olha também a linha seguinte.
 */
export function detectReferenceMonth(lines: readonly string[], fallback: string): string {
  const full = /(\d{2})\/(\d{2})\/(\d{4})/;
  for (let i = 0; i < lines.length; i += 1) {
    if (!/VENC/i.test(lines[i] ?? "")) continue;
    const match = full.exec(lines[i] ?? "") ?? full.exec(lines[i + 1] ?? "");
    if (match !== null) return `${match[3]}-${match[2]}`;
  }
  return fallback;
}

interface DatePrefix {
  date: string;
  length: number;
}

function readDate(line: string, referenceMonth: string): DatePrefix | null {
  let day: number;
  let month: number;
  let year: number | null = null;
  let length: number;

  const numeric = NUMERIC_DATE.exec(line);
  const named = numeric === null ? NAMED_DATE.exec(line) : null;
  if (numeric !== null) {
    day = Number(numeric[1]);
    month = Number(numeric[2]);
    if (numeric[3] !== undefined) {
      year = Number(numeric[3]);
      if (year < 100) year += 2000;
    }
    length = numeric[0].length;
  } else if (named !== null) {
    day = Number(named[1]);
    month = MONTHS.indexOf((named[2] ?? "").toUpperCase()) + 1;
    length = named[0].length;
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1) return null;
  const y = year ?? inferYear(month, referenceMonth);
  const ym = `${y}-${pad(month)}`;
  if (day > Number(lastDayOfMonth(ym).slice(8, 10))) return null;
  return { date: `${ym}-${pad(day)}`, length };
}

function readInstallment(description: string): { installment: Installment; rest: string } | null {
  for (const pattern of INSTALLMENT) {
    const match = pattern.exec(description);
    if (match === null) continue;
    const k = Number(match[1]);
    const n = Number(match[2]);
    if (k < 1 || n < 2 || k > n || n > MAX_INSTALLMENTS) continue;
    const rest = (
      description.slice(0, match.index) + description.slice(match.index + match[0].length)
    )
      .replace(/\s+/g, " ")
      .trim();
    return { installment: { k, n }, rest };
  }
  return null;
}

/**
 * Parser genérico: uma linha é lançamento se começa com data e tem valor.
 *
 * Genérico de propósito — um layout por banco quebraria no primeiro banco que
 * ninguém cadastrou. O preço é errar mais, e é por isso que tudo passa por uma
 * revisão antes de gravar: nada aqui decide sozinho o que vira lançamento.
 */
export function parseStatement(
  lines: readonly string[],
  doc: DocumentKind,
  referenceMonth: string,
): ParsedEntry[] {
  const entries: ParsedEntry[] = [];

  for (const line of lines) {
    const prefix = readDate(line, referenceMonth);
    if (prefix === null) continue;
    const body = line.slice(prefix.length);

    const amounts = [...body.matchAll(MONEY)];
    const first = amounts[0];
    // Fatura: o último valor (colunas de moeda estrangeira vêm antes do real).
    // Extrato: o primeiro (o seguinte é o saldo corrido).
    const chosen = doc === "card" ? amounts[amounts.length - 1] : first;
    if (first === undefined || chosen === undefined) continue;

    const amountMinor = Number(`${(chosen[3] ?? "").replace(/\./g, "")}${chosen[4] ?? ""}`);
    if (amountMinor === 0) continue;

    const printed = body
      .slice(0, first.index)
      .replace(/R\$\s*$/, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–|]+|[\s\-–|]+$/g, "");
    if (printed === "") continue;
    if (doc === "account" && BALANCE.test(printed)) continue;

    const sign = `${chosen[1] ?? ""}${chosen[2] ?? ""}${chosen[5] ?? ""}`;
    const negative = /[-−D]/.test(sign);
    const creditMark = /[+C]/.test(sign);

    let kind: TransactionKind;
    if (doc === "card") kind = negative || creditMark ? "income" : "expense";
    else kind = negative ? "expense" : "income";

    let rawDescription = printed;
    let installment: Installment | null = null;
    if (doc === "card" && kind === "expense") {
      const found = readInstallment(printed);
      if (found !== null && found.rest !== "") {
        installment = found.installment;
        rawDescription = found.rest;
      }
    }

    let selected = true;
    let note: string | null = null;
    if (doc === "card" && kind === "income") {
      if (CARD_PAYMENT.test(rawDescription)) {
        selected = false;
        note = "Pagamento da fatura — não é receita";
      } else {
        note = "Crédito na fatura — entra como receita";
      }
    }
    if (doc === "account" && kind === "expense" && ACCOUNT_CARD_BILL.test(rawDescription)) {
      selected = false;
      note = "Pagamento de fatura — as compras vêm pela fatura";
    }

    entries.push({
      date: prefix.date,
      description: rawDescription,
      rawDescription,
      amountMinor,
      kind,
      installment,
      selected,
      note,
    });
  }

  return entries;
}
