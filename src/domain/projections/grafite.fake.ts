import { budgetIdFor } from "../budgets/budget-id";
import { card, series } from "../cards/fixtures.fake";
import { stableEntityId } from "../ids/stable-id";
import type { AppState } from "../model/app-state";
import { EMPTY_APP_STATE } from "../model/app-state";
import { category } from "../model/books.fake";
import type { Budget } from "../model/budget";
import type { Recurrence } from "../model/recurrence";
import { EMERGENCY_COLOR, EMERGENCY_ICON, EMERGENCY_NAME } from "../model/reserve";
import { ALIVE } from "../model/row.fake";
import type { Transaction } from "../model/transaction";
import type { User } from "../model/user";
import { movement, reserve, tx } from "../reserves/fixtures.fake";

/**
 * Fixture "Grafite" da spec do dashboard do hub (§3.1), a mesma do lado Rust
 * (`dashboard::fixtures_grafite`) com os **mesmos ids**: a tabela 3.2 da spec é
 * conferida dos dois lados contra ela, e um id diferente mudaria a ordem de
 * "Últimos lançamentos" ou o dedupe de ocorrência. Valores em centavos.
 *
 * Ids dos avulsos são `MMDD-n-NOME`. "Últimos lançamentos" ordena por data e
 * desempata por id decrescente; em 18/11 a ordem Claude code, Almoço, Jantinha
 * só sai porque o id estável de RCLA começa por "F", acima de "1118-2" e
 * "1118-1" (ids estáveis também podem começar por dígito). O teste fixa a
 * ordem. O `.fake` o mantém fora do Vitest.
 */
export const GRAFITE_TODAY = "2026-11-19";

export const UL = "UL";
export const UG = "UG";
export const PMP = "PMP";
export const RE = "RE";
export const RC = "RC";

export const CAT = {
  compras: "CAT-COMPRAS",
  conforto: "CAT-CONFORTO",
  assinaturas: "CAT-ASSINATURAS",
  contas: "CAT-CONTAS",
  mercado: "CAT-MERCADO",
  sogrinha: "CAT-SOGRINHA",
  manutencao: "CAT-MANUTENCAO",
  pets: "CAT-PETS",
  transporte: "CAT-TRANSPORTE",
} as const;

/**
 * Id da ocorrência = `stableEntityId("<série>:<competência>")`, como a
 * materialização grava. O hub reconhece a ocorrência já gravada por esse id.
 */
export function occurrenceIdOf(recurrenceId: string, period: string): string {
  return stableEntityId(`${recurrenceId}:${period}`);
}

const users: User[] = [
  { ...ALIVE, id: UL, name: "Luiz", color: "teal", avatar: null },
  { ...ALIVE, id: UG, name: "Gigi", color: "rose", avatar: null },
];

const categories = [
  category(CAT.compras, { name: "Compras", icon: "shopping-bag", color: "violet" }),
  category(CAT.conforto, { name: "Conforto", icon: "coffee", color: "amber" }),
  category(CAT.assinaturas, { name: "Assinaturas", icon: "film", color: "indigo" }),
  category(CAT.contas, { name: "Contas", icon: "receipt", color: "sky" }),
  category(CAT.mercado, { name: "Mercado", icon: "shopping-cart", color: "emerald" }),
  category(CAT.sogrinha, { name: "Sogrinha", icon: "gift", color: "fuchsia" }),
  category(CAT.manutencao, { name: "Manutenção", icon: "house", color: "orange" }),
  category(CAT.pets, { name: "Pets", icon: "paw-print", color: "lime" }),
  category(CAT.transporte, { name: "Transporte", icon: "bus", color: "teal" }),
];

/** Mensal, dia fixo, ativa, sem `variable`; autor UL. */
function monthly(
  id: string,
  kind: Recurrence["kind"],
  description: string,
  categoryId: string | null,
  amountMinor: number,
  startOn: string,
  endOn: string | null = null,
): Recurrence {
  return series(id, null, {
    kind,
    description,
    categoryId,
    amountMinor,
    scheduleType: "dayOfMonth",
    scheduleN: Number(startOn.slice(8, 10)),
    startOn,
    endOn,
    userId: UL,
  });
}

const recurrences: Recurrence[] = [
  monthly("RSAL", "income", "Salário", null, 350_000, "2026-11-05"),
  monthly("RCON", "expense", "Contas da casa", CAT.contas, 53_901, "2026-11-10"),
  // Sem categoria na série (tile neutro em "Próximas"); a ocorrência entra em Assinaturas.
  monthly("RPRI", "expense", "Amazon prime", null, 1_999, "2026-11-01"),
  monthly("RMEL", "expense", "Meli+", null, 999, "2026-11-01"),
  monthly("RCLA", "expense", "Claude code", CAT.assinaturas, 11_840, "2026-11-18"),
  monthly("RSPO", "expense", "Spotify", CAT.assinaturas, 1_999, "2026-11-15"),
  monthly("RSOG", "expense", "Mesada da sogrinha", CAT.sogrinha, 16_862, "2026-11-02"),
  monthly("RCAD", "expense", "Cadeira (2x)", CAT.compras, 5_052, "2026-10-21", "2026-11-21"),
];

/** Ocorrência materializada da série, com a categoria dada (pode diferir da série). */
function occurrence(rec: Recurrence, occurredOn: string, categoryId: string | null): Transaction {
  const period = occurredOn.slice(0, 7);
  return tx(occurrenceIdOf(rec.id, period), rec.kind, rec.amountMinor, occurredOn, categoryId, {
    description: rec.description,
    userId: UL,
    recurrenceId: rec.id,
    occurrenceKey: `${rec.id}:${period}`,
  });
}

function rec(id: string): Recurrence {
  const found = recurrences.find((r) => r.id === id);
  if (found === undefined) throw new Error(`série ${id} fora da fixture`);
  return found;
}

/** Todas as de novembro com dia ≤ 19 e a Cadeira de outubro; a de 21/11 ainda não. */
const occurrences: Transaction[] = [
  occurrence(rec("RSAL"), "2026-11-05", null),
  occurrence(rec("RCON"), "2026-11-10", CAT.contas),
  occurrence(rec("RPRI"), "2026-11-01", CAT.assinaturas),
  occurrence(rec("RMEL"), "2026-11-01", CAT.assinaturas),
  occurrence(rec("RCLA"), "2026-11-18", CAT.assinaturas),
  occurrence(rec("RSPO"), "2026-11-15", CAT.assinaturas),
  occurrence(rec("RSOG"), "2026-11-02", CAT.sogrinha),
  occurrence(rec("RCAD"), "2026-10-21", CAT.compras),
];

function spend(
  id: string,
  description: string,
  amountMinor: number,
  occurredOn: string,
  categoryId: string,
  userId: string,
  paymentMethodId: string | null = null,
): Transaction {
  return tx(id, "expense", amountMinor, occurredOn, categoryId, {
    description,
    userId,
    paymentMethodId,
  });
}

/** Outubro: receita 507229; despesa 270500 em 10/10 e 90648 em 25/10 (+ Cadeira 5052). */
const october: Transaction[] = [
  tx("1005-1-RECEITA", "income", 507_229, "2026-10-05", null, {
    description: "Salário de outubro",
    userId: UL,
  }),
  spend("1010-1-COMPRAS", "Compras do mês", 37_330, "2026-10-10", CAT.compras, UL),
  spend("1010-2-MERCADO", "Mercado do mês", 233_170, "2026-10-10", CAT.mercado, UL),
  spend("1025-1-MERCADO", "Mercado", 90_648, "2026-10-25", CAT.mercado, UL),
];

/**
 * Novembro, avulsos dos dias 2 a 18 (223741). UG lança Manutenção, Pets,
 * Transporte, o avulso da Sogrinha e 23444 do Mercado (47300); o resto é UL.
 * Só Almoço e Jantinha caem em 18/11, para a ordem de "Últimos lançamentos".
 */
const november: Transaction[] = [
  spend("1103-1-COMPRAS", "Fone de ouvido", 29_990, "2026-11-03", CAT.compras, UL, PMP),
  spend("1114-1-COMPRAS", "Tênis", 21_525, "2026-11-14", CAT.compras, UL, PMP),
  spend("1107-1-CONFORTO", "Restaurante", 18_000, "2026-11-07", CAT.conforto, UL),
  spend("1112-1-CONFORTO", "Cinema e pipoca", 12_750, "2026-11-12", CAT.conforto, UL),
  spend("1118-2-ALMOCO", "Almoço", 2_097, "2026-11-18", CAT.conforto, UL),
  spend("1118-1-JANTINHA", "Jantinha", 6_589, "2026-11-18", CAT.conforto, UL),
  spend("1104-1-MERCADO", "Mercado", 45_000, "2026-11-04", CAT.mercado, UL),
  spend("1109-1-MERCADO", "Feira", 23_444, "2026-11-09", CAT.mercado, UG),
  spend("1116-1-MERCADO", "Mercado", 40_490, "2026-11-16", CAT.mercado, UL),
  spend("1111-1-SOGRINHA", "Remédio da sogrinha", 628, "2026-11-11", CAT.sogrinha, UG),
  spend("1113-1-MANUTENCAO", "Encanador", 10_728, "2026-11-13", CAT.manutencao, UG),
  spend("1106-1-PETS", "Ração", 7_500, "2026-11-06", CAT.pets, UG),
  spend("1117-1-TRANSPORTE", "Uber", 5_000, "2026-11-17", CAT.transporte, UG),
];

const budgets: Budget[] = (
  [
    [CAT.compras, 40_000],
    [CAT.conforto, 40_000],
    [CAT.assinaturas, 18_000],
    [CAT.contas, 65_000],
    [CAT.mercado, 141_500],
  ] as const
).map(([categoryId, limitMinor]) => ({
  ...ALIVE,
  id: budgetIdFor(categoryId),
  categoryId,
  limitMinor,
}));

const reserves = [
  reserve(RE, {
    kind: "emergency",
    name: EMERGENCY_NAME,
    icon: EMERGENCY_ICON,
    color: EMERGENCY_COLOR,
    multiple: 6,
    essentialCategoryIds: null,
    essentialOverrideMinor: 250_000,
    recurring: { amountMinor: 55_000, day: 5, since: "2026-11" },
  }),
  reserve(RC, { name: "Casamento", targetMinor: 150_000, deadline: "2027-11" }),
];

const movements = [
  movement("MOV-RE-1006", RE, 55_000, "2026-10-06", { userId: UL }),
  movement("MOV-RE-1106", RE, 10_000, "2026-11-06", { userId: UL }),
  movement("MOV-RE-1112", RE, -30_000, "2026-11-12", { userId: UL, reason: "home" }),
  movement("MOV-RC-1015", RC, 15_000, "2026-10-15", { userId: UL }),
];

const paymentMethods = [
  card(PMP, {
    name: "Mercado Pago",
    bank: "Mercado Pago",
    closingDay: 28,
    dueDay: 8,
  }),
];

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

/** Estado novo a cada chamada: um teste que mute não vaza para o próximo. */
export function grafiteState(): AppState {
  return structuredClone({
    ...EMPTY_APP_STATE,
    users: byId(users),
    categories: byId(categories),
    paymentMethods: byId(paymentMethods),
    transactions: byId([...occurrences, ...october, ...november]),
    recurrences: byId(recurrences),
    budgets: byId(budgets),
    reserves: byId(reserves),
    reserveMovements: byId(movements),
  });
}
