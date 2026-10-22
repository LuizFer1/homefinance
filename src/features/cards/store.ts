import { type Signal, signal } from "@preact/signals";
import { clearCardMigrationDeferral, deferCardMigration } from "../../data/card-migration";
import type { HomeFinanceDb } from "../../data/db";
import type { Ulid } from "../../domain/ids/ulid";
import { describeError, type Session } from "../session/session";
import { type Destination, planCardMigration } from "./plan";

export interface CardsStore {
  /** Verdadeiro depois de "Depois": o aviso não reabre até o próximo boot. */
  deferred: Signal<boolean>;
  /** Limpa o adiamento do boot anterior. Falha de leitura não impede o app de abrir. */
  init: () => Promise<void>;
  /** Adia o aviso neste aparelho; quem chama não espera a gravação. */
  defer: () => Promise<void>;
  /**
   * Atribui os grupos aos cartões escolhidos, tudo ou nada. Devolve quantos
   * lançamentos mudaram. `StaleRowsError` quer dizer que outro aparelho mexeu
   * nas linhas desde que a tela abriu: nada foi gravado e a tela deve
   * recarregar os grupos.
   */
  migrate: (choices: Readonly<Record<Ulid, Destination>>) => Promise<number>;
}

export function createCardsStore(
  session: Session,
  db: HomeFinanceDb,
  now: () => number = Date.now,
): CardsStore {
  const deferred = signal(false);

  return {
    deferred,
    async init() {
      try {
        await clearCardMigrationDeferral(db);
      } catch {
        // Sem IndexedDB o app inteiro já avisa; aqui só não bloqueia o boot.
      }
      deferred.value = false;
    },
    async defer() {
      // Em memória primeiro: o aviso fecha mesmo que a gravação falhe.
      deferred.value = true;
      try {
        await deferCardMigration(db, new Date(now()).toISOString());
      } catch {
        // O adiamento desta sessão já vale; só não sobrevive ao fechamento.
      }
    },
    async migrate(choices) {
      try {
        const plan = planCardMigration(session.state.value, choices, session.clock());
        if (plan.moved === 0 && (plan.rows.paymentMethods?.length ?? 0) === 0) return 0;
        await session.putRowsIfCurrent(plan.rows, plan.expected);
        return plan.moved;
      } catch (cause) {
        // Também as recusas do planejamento: a tela mostra `session.error`.
        session.error.value = describeError(cause);
        throw cause;
      }
    },
  };
}
