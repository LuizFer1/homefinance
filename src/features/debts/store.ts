import { debtAmountsProblem, isIsoDate, MAX_NAME } from "../../domain/business/rules";
import type { Ulid } from "../../domain/ids/ulid";
import { isAlive } from "../../domain/model/base";
import type { Debt, DebtDraft } from "../../domain/model/debt";
import { describeError, type Session } from "../session/session";

export interface DebtInput {
  name: string;
  /** Quem emprestou; vazio vira `null`. */
  creditor: string | null;
  /** Valor original, em centavos. */
  principalMinor: number;
  /** Saldo devedor atual, em centavos: de 0 (quitada) até o valor original. */
  balanceMinor: number;
  /** 'YYYY-MM-DD', ou `null` sem vencimento. */
  dueOn: string | null;
}

/**
 * Dívidas do negócio: cadastro simples com saldo editável (sem parcelas nem juros).
 * Nunca são lançamentos. Só a conta comercial as enxerga e grava.
 */
export interface DebtsStore {
  create: (input: DebtInput) => Promise<Debt>;
  edit: (id: Ulid, input: DebtInput) => Promise<Debt>;
  remove: (id: Ulid) => Promise<Debt>;
}

type DebtFields = Pick<
  DebtDraft,
  "name" | "creditor" | "principalMinor" | "balanceMinor" | "dueOn"
>;

/** Guarda para qualquer chamador, não só o sheet: o log é eterno e o hub soma o que chegar. */
function cleanInput(input: DebtInput): DebtInput {
  const name = input.name.trim();
  if (name === "") throw new Error("Dê um nome à dívida.");
  if (name.length > MAX_NAME) throw new Error(`O nome aceita até ${MAX_NAME} caracteres.`);
  const creditor = input.creditor?.trim() || null;
  if (creditor !== null && creditor.length > MAX_NAME) {
    throw new Error(`O credor aceita até ${MAX_NAME} caracteres.`);
  }
  const problem = debtAmountsProblem(input.principalMinor, input.balanceMinor);
  if (problem !== null) throw new Error(problem);
  if (input.dueOn !== null && !isIsoDate(input.dueOn)) throw new Error("Data inválida.");
  return {
    name,
    creditor,
    principalMinor: input.principalMinor,
    balanceMinor: input.balanceMinor,
    dueOn: input.dueOn,
  };
}

export function createDebtsStore(session: Session): DebtsStore {
  /** Toda falha preenche `session.error` e relança, inclusive a validação anterior à escrita. */
  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (cause) {
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  /**
   * `mutate` carimba a conta **ativa**: na pessoal a dívida nasceria pessoal, e
   * nenhuma tela a mostraria. Recusar aqui evita a linha órfã.
   */
  function assertBusiness(): void {
    if (session.activeBook.value !== "business") {
      throw new Error("Dívidas só existem na conta comercial.");
    }
  }

  /** Lida da visão da conta ativa: um id da outra conta não existe para esta store. */
  function aliveDebt(id: Ulid): Debt {
    const debt = session.state.value.debts[id];
    if (!isAlive(debt)) throw new Error("Dívida não existe.");
    return debt;
  }

  return {
    create: (input) =>
      guarded(async () => {
        assertBusiness();
        const draft = cleanInput(input);
        return session.mutate("debts", (repo) => repo.create(draft));
      }),

    edit: (id, input) =>
      guarded(async () => {
        assertBusiness();
        const current = aliveDebt(id);
        const draft = cleanInput(input);
        // O repositório compara com `!==`: `null` contra um campo ausente (linha
        // gravada sem `creditor`) contaria como mudança e carimbaria um HLC novo sem
        // mudar nada — e esse carimbo vazio venceria uma edição real do outro celular.
        // Só entra o que mudou de fato; `null` limpa (`undefined` seria descartado).
        const changes: Partial<DebtFields> = {};
        for (const key of Object.keys(draft) as (keyof DebtFields)[]) {
          if ((current[key] ?? null) !== (draft[key] ?? null)) {
            (changes as Record<string, unknown>)[key] = draft[key];
          }
        }
        if (Object.keys(changes).length === 0) return current;
        return session.mutate("debts", (repo) => repo.update(id, changes));
      }),

    remove: (id) =>
      guarded(async () => {
        assertBusiness();
        aliveDebt(id);
        return session.mutate("debts", (repo) => repo.remove(id));
      }),
  };
}
